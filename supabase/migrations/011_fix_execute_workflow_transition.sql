-- ============================================================================
-- 011_fix_execute_workflow_transition.sql
-- Replace execute_workflow_transition with a corrected version that:
--   1) Routes consultant_submit to technical_unit (NOT project_coordinator)
--   2) Assigns the submittal to the technical_unit member of the project
--   3) Creates a notification for the assigned technical user
--   4) Creates an audit_log entry for every transition
--   5) Returns the assigned user info in the response
-- ============================================================================

-- ── Add assigned_to_user_id column if it doesn't exist ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submittals' AND column_name = 'assigned_to_user_id'
  ) THEN
    ALTER TABLE submittals ADD COLUMN assigned_to_user_id UUID REFERENCES users(id);
  END IF;
END $$;

-- ── Create or replace the main workflow transition function ───────────
CREATE OR REPLACE FUNCTION execute_workflow_transition(
  p_submittal_id   UUID,
  p_trigger_name   TEXT,
  p_user_id        UUID,
  p_action_code    TEXT DEFAULT NULL,
  p_comments       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_submittal        RECORD;
  v_old_status       TEXT;
  v_new_status       TEXT;
  v_new_stage        TEXT;
  v_assigned_role    TEXT;
  v_assigned_user_id UUID;
  v_assigned_name    TEXT;
  v_project_id       UUID;
  v_notif_title      TEXT;
  v_notif_message    TEXT;
BEGIN
  -- ── 1) Lock and fetch the submittal ────────────────────────────────
  SELECT s.id, s.status::TEXT, s.submittal_stage::TEXT, s.deliverable_id,
         d.phase_id, p.project_id
    INTO v_submittal
    FROM submittals s
    JOIN deliverables d ON d.id = s.deliverable_id
    JOIN phases p ON p.id = d.phase_id
   WHERE s.id = p_submittal_id
   FOR UPDATE OF s;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submittal not found');
  END IF;

  v_old_status := v_submittal.status;
  v_project_id := v_submittal.project_id;

  -- ── 2) Determine transition based on trigger ──────────────────────
  CASE p_trigger_name

    -- ━━ consultant_submit: draft → submitted (stage = technical) ━━━━
    WHEN 'consultant_submit' THEN
      IF v_old_status NOT IN ('draft', 'revision_required') THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Cannot submit: current status is ' || v_old_status || '. Expected draft or revision_required.'
        );
      END IF;
      IF v_old_status = 'revision_required' THEN
        v_new_status := 'resubmitted';
      ELSE
        v_new_status := 'submitted';
      END IF;
      v_new_stage    := 'technical';
      v_assigned_role := 'technical_unit';

    -- ━━ coordinator_pickup: submitted/resubmitted → under_review ━━━━
    WHEN 'coordinator_pickup' THEN
      IF v_old_status NOT IN ('submitted', 'resubmitted') THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Cannot pick up: current status is ' || v_old_status
        );
      END IF;
      v_new_status    := 'under_review';
      v_new_stage     := COALESCE(v_submittal.submittal_stage, 'technical');
      v_assigned_role := CASE v_new_stage
        WHEN 'technical' THEN 'technical_unit'
        WHEN 'quality'   THEN 'quality_unit'
        WHEN 'pm'        THEN 'project_manager'
        ELSE 'technical_unit'
      END;

    -- ━━ reviewer_return: under_review → revision_required ━━━━━━━━━━
    WHEN 'reviewer_return' THEN
      IF v_old_status <> 'under_review' THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Cannot return: current status is ' || v_old_status
        );
      END IF;
      IF p_action_code IS NULL OR p_action_code NOT IN ('B', 'C') THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'reviewer_return requires action_code B or C'
        );
      END IF;
      v_new_status    := 'revision_required';
      v_new_stage     := 'returned';
      v_assigned_role := 'submitter';

    -- ━━ reviewer_reject: under_review → rejected ━━━━━━━━━━━━━━━━━━━
    WHEN 'reviewer_reject' THEN
      IF v_old_status <> 'under_review' THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Cannot reject: current status is ' || v_old_status
        );
      END IF;
      IF p_action_code IS NULL OR p_action_code <> 'D' THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'reviewer_reject requires action_code D'
        );
      END IF;
      v_new_status    := 'rejected';
      v_new_stage     := NULL;
      v_assigned_role := NULL;

    -- ━━ owner_approve: under_review (pm stage) → approved ━━━━━━━━━━
    WHEN 'owner_approve' THEN
      IF v_old_status <> 'under_review' THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Cannot approve: current status is ' || v_old_status
        );
      END IF;
      IF p_action_code IS NULL OR p_action_code NOT IN ('A', 'B') THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'owner_approve requires action_code A or B'
        );
      END IF;
      v_new_status    := 'approved';
      v_new_stage     := NULL;
      v_assigned_role := NULL;

    -- ━━ owner_reject: under_review → rejected ━━━━━━━━━━━━━━━━━━━━━━
    WHEN 'owner_reject' THEN
      IF v_old_status <> 'under_review' THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Cannot reject: current status is ' || v_old_status
        );
      END IF;
      v_new_status    := 'rejected';
      v_new_stage     := NULL;
      v_assigned_role := NULL;

    -- ━━ consultant_resubmit: revision_required → resubmitted ━━━━━━━
    WHEN 'consultant_resubmit' THEN
      IF v_old_status <> 'revision_required' THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Cannot resubmit: current status is ' || v_old_status
        );
      END IF;
      v_new_status    := 'resubmitted';
      v_new_stage     := 'technical';
      v_assigned_role := 'technical_unit';

    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Unknown trigger: ' || p_trigger_name
      );
  END CASE;

  -- ── 3) Find assigned user from project_members ────────────────────
  IF v_assigned_role IS NOT NULL THEN
    -- Look up by canonical role first, then try legacy aliases
    SELECT pm.user_id, u.full_name
      INTO v_assigned_user_id, v_assigned_name
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id AND u.is_active = true
     WHERE pm.project_id = v_project_id
       AND pm.role::TEXT = v_assigned_role
     LIMIT 1;

    -- Fallback: try legacy role mappings
    IF v_assigned_user_id IS NULL AND v_assigned_role = 'technical_unit' THEN
      SELECT pm.user_id, u.full_name
        INTO v_assigned_user_id, v_assigned_name
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id AND u.is_active = true
       WHERE pm.project_id = v_project_id
         AND pm.role::TEXT = 'project_coordinator'
       LIMIT 1;
    END IF;

    IF v_assigned_user_id IS NULL AND v_assigned_role = 'submitter' THEN
      -- For return-to-submitter, use the original submitted_by
      SELECT s.submitted_by, u.full_name
        INTO v_assigned_user_id, v_assigned_name
        FROM submittals s
        JOIN users u ON u.id = s.submitted_by
       WHERE s.id = p_submittal_id;
    END IF;

    -- If still no user found and the role is required, return error
    IF v_assigned_user_id IS NULL AND v_assigned_role IN ('technical_unit', 'quality_unit', 'project_manager') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'لا يوجد مستخدم بدور "' || v_assigned_role || '" في هذا المشروع. يرجى إضافة عضو بالدور المطلوب أولاً.'
      );
    END IF;
  END IF;

  -- ── 4) Update the submittal ───────────────────────────────────────
  UPDATE submittals
     SET status               = v_new_status::submittal_status,
         submittal_stage       = v_new_stage::submittal_stage,
         assigned_to_user_id   = v_assigned_user_id,
         assigned_role         = v_assigned_role,
         current_stage_started_at = NOW(),
         submitted_at          = CASE
                                   WHEN v_new_status IN ('submitted', 'resubmitted') AND submitted_at IS NULL
                                   THEN NOW()
                                   ELSE submitted_at
                                 END,
         updated_at            = NOW()
   WHERE id = p_submittal_id;

  -- ── 5) Record in workflow_transitions if the table exists ─────────
  -- (It may have been created in migrations 001-007; safe guard with IF EXISTS)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_transitions') THEN
    EXECUTE format(
      'INSERT INTO workflow_transitions (submittal_id, trigger, from_status, to_status, performed_by, action_code, comments, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
      p_submittal_id, p_trigger_name, v_old_status, v_new_status, p_user_id, p_action_code, p_comments
    ) USING p_submittal_id, p_trigger_name, v_old_status, v_new_status, p_user_id, p_action_code, p_comments;
  END IF;

  -- ── 6) Create audit_log entry ─────────────────────────────────────
  INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, old_value, new_value)
  VALUES (
    'submittal',
    p_submittal_id,
    'status_change',
    p_user_id,
    jsonb_build_object('status', v_old_status, 'submittal_stage', v_submittal.submittal_stage),
    jsonb_build_object('status', v_new_status, 'submittal_stage', v_new_stage, 'assigned_to', v_assigned_name, 'trigger', p_trigger_name)
  );

  -- ── 7) Create notification for the assigned user ──────────────────
  IF v_assigned_user_id IS NOT NULL AND v_assigned_user_id <> p_user_id THEN
    -- Build notification text based on the trigger
    CASE p_trigger_name
      WHEN 'consultant_submit' THEN
        v_notif_title   := 'طلب جديد للمراجعة';
        v_notif_message := 'تم تقديم طلب جديد ويحتاج مراجعتك الفنية';
      WHEN 'consultant_resubmit' THEN
        v_notif_title   := 'إعادة تقديم طلب';
        v_notif_message := 'تمت إعادة تقديم طلب بعد التعديل ويحتاج مراجعتك';
      WHEN 'reviewer_return' THEN
        v_notif_title   := 'طلب يحتاج تعديل';
        v_notif_message := 'تم إرجاع طلبك ويحتاج تعديلات';
      ELSE
        v_notif_title   := 'تحديث على طلب';
        v_notif_message := 'تم تحديث حالة طلب مرتبط بك';
    END CASE;

    INSERT INTO notifications (user_id, title, message, entity_type, entity_id)
    VALUES (v_assigned_user_id, v_notif_title, v_notif_message, 'submittal', p_submittal_id);
  END IF;

  -- ── 8) Return success with full context ───────────────────────────
  RETURN jsonb_build_object(
    'success',        true,
    'old_status',     v_old_status,
    'new_status',     v_new_status,
    'trigger',        p_trigger_name,
    'submittal_id',   p_submittal_id,
    'new_stage',      v_new_stage,
    'assigned_to',    v_assigned_name,
    'assigned_role',  v_assigned_role
  );
END;
$$;

-- ── Grant execute to service_role (edge function uses this) ─────────
GRANT EXECUTE ON FUNCTION execute_workflow_transition(UUID, TEXT, UUID, TEXT, TEXT) TO service_role;
