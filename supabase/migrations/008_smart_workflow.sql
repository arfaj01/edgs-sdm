-- ============================================================================
-- Migration 008 — Smart Workflow Automation (ADDITIVE, SAFE TO APPLY)
-- ============================================================================
-- This migration adds SLA / due-date / auto-routing infrastructure WITHOUT
-- touching any existing column, constraint, trigger, function, or RLS policy.
-- It is 100% additive — the UI works fine without it (computes everything
-- client-side in src/lib/workflow-sla.ts), and applies cleanly on top of the
-- production schema.
--
-- What it adds:
--   1. stage_sla_config    — tunable SLA hours per stage
--   2. submittals columns  — current_stage_started_at, due_at, assigned_role,
--                            next_action, overdue_flag  (all NULLABLE, defaulted)
--   3. trg_recalc_submittal_sla — recomputes due_at / assigned_role /
--                            next_action / overdue_flag on every UPDATE
--   4. v_submittal_workflow — convenience view joining submittals with its
--                            computed workflow state (used by dashboards)
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. SLA CONFIGURATION TABLE
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stage_sla_config (
  stage TEXT PRIMARY KEY,
  sla_hours INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO stage_sla_config (stage, sla_hours) VALUES
  ('technical', 48),
  ('quality', 24),
  ('pm', 48)
ON CONFLICT (stage) DO NOTHING;

COMMENT ON TABLE stage_sla_config IS
  'Tunable per-stage SLA hours. Mirrors SLA_HOURS_BY_STAGE in src/lib/workflow-sla.ts.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. ADDITIVE COLUMNS ON submittals
-- ────────────────────────────────────────────────────────────────────────────
-- Every column here is NULLABLE with a safe default so backfill is trivial
-- and rollback is just a DROP COLUMN.
ALTER TABLE submittals
  ADD COLUMN IF NOT EXISTS current_stage_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_role TEXT,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS overdue_flag BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN submittals.current_stage_started_at IS
  'ISO timestamp when the submittal entered its current stage.';
COMMENT ON COLUMN submittals.due_at IS
  'ISO timestamp the current stage is due by, computed from stage_sla_config.';
COMMENT ON COLUMN submittals.assigned_role IS
  'Canonical role that currently owns the next action (submitter, technical_unit, quality_unit, project_manager).';
COMMENT ON COLUMN submittals.next_action IS
  'i18n key for the next required action (workflowAuto.actionTechnicalReview, etc.).';
COMMENT ON COLUMN submittals.overdue_flag IS
  'Cached flag; trg_recalc_submittal_sla recomputes on every update.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. PURE FUNCTION: compute (assigned_role, next_action, active_stage)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION compute_workflow_routing(
  p_status TEXT,
  p_stage  TEXT
)
RETURNS TABLE (
  assigned_role TEXT,
  next_action TEXT,
  active_stage TEXT
)
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  -- Terminal states
  IF p_status IN ('approved', 'rejected') THEN
    RETURN QUERY SELECT NULL::TEXT,
      CASE WHEN p_status = 'approved' THEN 'workflowAuto.actionApproved'
           ELSE 'workflowAuto.actionRejected' END,
      NULL::TEXT;
    RETURN;
  END IF;

  -- Draft / revision_required → submitter
  IF p_status IN ('draft', 'revision_required') THEN
    RETURN QUERY SELECT 'submitter'::TEXT,
      CASE WHEN p_status = 'draft' THEN 'workflowAuto.actionDraftSubmit'
           ELSE 'workflowAuto.actionRevisionRequired' END,
      NULL::TEXT;
    RETURN;
  END IF;

  -- Routed by stage
  IF p_stage = 'technical' THEN
    RETURN QUERY SELECT 'technical_unit'::TEXT, 'workflowAuto.actionTechnicalReview'::TEXT, 'technical'::TEXT;
    RETURN;
  ELSIF p_stage = 'quality' THEN
    RETURN QUERY SELECT 'quality_unit'::TEXT, 'workflowAuto.actionQualityReview'::TEXT, 'quality'::TEXT;
    RETURN;
  ELSIF p_stage = 'pm' THEN
    RETURN QUERY SELECT 'project_manager'::TEXT, 'workflowAuto.actionPMApproval'::TEXT, 'pm'::TEXT;
    RETURN;
  ELSIF p_stage = 'returned' THEN
    RETURN QUERY SELECT 'submitter'::TEXT, 'workflowAuto.actionReturned'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- submitted/resubmitted/under_review with no stage → default to technical
  IF p_status IN ('submitted', 'resubmitted', 'under_review') THEN
    RETURN QUERY SELECT 'technical_unit'::TEXT, 'workflowAuto.actionTechnicalReview'::TEXT, 'technical'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION compute_workflow_routing(TEXT, TEXT) IS
  'Pure helper. Mirrors computeAssignedRole + computeNextActionKey + computeActiveStage in src/lib/workflow-sla.ts.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. TRIGGER FUNCTION: recompute SLA fields whenever status/stage changes
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_recalc_submittal_sla()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_routing RECORD;
  v_sla_hours INTEGER;
  v_started TIMESTAMPTZ;
BEGIN
  -- Resolve routing from the new row
  SELECT * INTO v_routing
  FROM compute_workflow_routing(NEW.status::TEXT, NEW.submittal_stage::TEXT);

  NEW.assigned_role := v_routing.assigned_role;
  NEW.next_action   := v_routing.next_action;

  -- If entering a new stage (or stage changed), stamp started_at to now.
  IF TG_OP = 'INSERT'
     OR OLD.submittal_stage IS DISTINCT FROM NEW.submittal_stage
     OR OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.current_stage_started_at := now();
  END IF;

  v_started := COALESCE(NEW.current_stage_started_at, NEW.submitted_at, NEW.updated_at, now());

  -- Look up SLA hours for the active stage
  IF v_routing.active_stage IS NOT NULL THEN
    SELECT sla_hours INTO v_sla_hours
    FROM stage_sla_config
    WHERE stage = v_routing.active_stage;

    IF v_sla_hours IS NOT NULL THEN
      NEW.due_at := v_started + (v_sla_hours || ' hours')::INTERVAL;
      NEW.overdue_flag := (NEW.due_at < now());
    ELSE
      NEW.due_at := NULL;
      NEW.overdue_flag := FALSE;
    END IF;
  ELSE
    NEW.due_at := NULL;
    NEW.overdue_flag := FALSE;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_recalc_submittal_sla() IS
  'BEFORE INSERT/UPDATE trigger that keeps due_at/assigned_role/next_action/overdue_flag in sync. No side effects outside the row.';

DROP TRIGGER IF EXISTS submittals_sla_recalc ON submittals;
CREATE TRIGGER submittals_sla_recalc
  BEFORE INSERT OR UPDATE ON submittals
  FOR EACH ROW
  EXECUTE FUNCTION trg_recalc_submittal_sla();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. ONE-TIME BACKFILL so the new columns are populated on existing rows
-- ────────────────────────────────────────────────────────────────────────────
-- Because the trigger fires BEFORE UPDATE, a no-op UPDATE is enough to
-- populate every existing row's new columns.
UPDATE submittals SET updated_at = updated_at
WHERE current_stage_started_at IS NULL OR due_at IS NULL OR assigned_role IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. INDEX for overdue dashboards
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_submittals_overdue
  ON submittals (overdue_flag, assigned_role)
  WHERE deleted_at IS NULL AND overdue_flag = TRUE;

CREATE INDEX IF NOT EXISTS idx_submittals_assigned_role
  ON submittals (assigned_role)
  WHERE deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. CONVENIENCE VIEW for dashboards
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_submittal_workflow AS
SELECT
  s.id,
  s.submittal_number,
  s.deliverable_id,
  s.status,
  s.submittal_stage,
  s.submitted_at,
  s.updated_at,
  s.current_stage_started_at,
  s.due_at,
  s.assigned_role,
  s.next_action,
  s.overdue_flag,
  CASE
    WHEN s.due_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (s.due_at - now())) / 3600.0
  END AS hours_remaining
FROM submittals s
WHERE s.deleted_at IS NULL;

COMMENT ON VIEW v_submittal_workflow IS
  'Flat view of submittals with computed workflow fields for dashboard queries.';

-- ============================================================================
-- END OF MIGRATION 008
-- ============================================================================
