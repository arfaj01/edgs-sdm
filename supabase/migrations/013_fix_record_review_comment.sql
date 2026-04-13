-- ============================================================================
-- Migration 013: Fix record_review_comment RPC
-- ============================================================================
-- ROOT CAUSE: The existing record_review_comment function writes reviewer_role
-- as a VARCHAR into a column typed as user_role enum, causing:
--   "column 'reviewer_role' is of type user_role but expression is of type character varying"
--
-- FIX: Drop and recreate with proper ::user_role cast and robust role lookup.
-- The function resolves the reviewer's role from project_members (via the
-- submittal → deliverable → phase → project chain) and casts it explicitly.
-- ============================================================================

-- Drop any existing signatures (old function may have different params)
DROP FUNCTION IF EXISTS public.record_review_comment(UUID, UUID, VARCHAR, TEXT);
DROP FUNCTION IF EXISTS public.record_review_comment(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_review_comment(UUID, UUID, action_code, TEXT);

CREATE OR REPLACE FUNCTION public.record_review_comment(
  p_submittal_id  UUID,
  p_user_id       UUID,
  p_action_code   TEXT,
  p_comments      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reviewer_role   TEXT;
  v_project_id      UUID;
  v_submittal       RECORD;
  v_review_step     INT;
  v_review_id       UUID;
BEGIN
  -- ── 1) Validate submittal exists and is in a reviewable state ──
  SELECT s.id, s.deliverable_id, s.status, s.submittal_stage
    INTO v_submittal
    FROM submittals s
   WHERE s.id = p_submittal_id
     AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submittal not found');
  END IF;

  IF v_submittal.status NOT IN ('submitted', 'under_review', 'resubmitted') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Cannot review submittal in status: %s', v_submittal.status)
    );
  END IF;

  -- ── 2) Resolve project_id via deliverable → phase → project chain ──
  SELECT ph.project_id
    INTO v_project_id
    FROM deliverables d
    JOIN phases ph ON ph.id = d.phase_id
   WHERE d.id = v_submittal.deliverable_id;

  -- ── 3) Resolve reviewer's role from project_members ──
  IF v_project_id IS NOT NULL THEN
    SELECT pm.role::TEXT
      INTO v_reviewer_role
      FROM project_members pm
     WHERE pm.project_id = v_project_id
       AND pm.user_id = p_user_id
     LIMIT 1;
  END IF;

  -- Fallback: look up from users table if not in project_members
  IF v_reviewer_role IS NULL THEN
    SELECT u.role::TEXT
      INTO v_reviewer_role
      FROM users u
     WHERE u.id = p_user_id;
  END IF;

  -- Last resort: default to 'technical_unit'
  IF v_reviewer_role IS NULL THEN
    v_reviewer_role := 'technical_unit';
  END IF;

  RAISE NOTICE '[record_review_comment] user=%, role=%, submittal=%, action=%',
    p_user_id, v_reviewer_role, p_submittal_id, p_action_code;

  -- ── 4) Determine review_step (sequential counter per submittal) ──
  SELECT COALESCE(MAX(review_step), 0) + 1
    INTO v_review_step
    FROM reviews
   WHERE submittal_id = p_submittal_id;

  -- ── 5) Insert review record with EXPLICIT enum cast ──
  INSERT INTO reviews (
    submittal_id,
    reviewer_id,
    reviewer_role,
    action_code,
    comments,
    review_step,
    reviewed_at,
    created_at,
    updated_at
  ) VALUES (
    p_submittal_id,
    p_user_id,
    v_reviewer_role::user_role,         -- ← THE FIX: explicit cast
    p_action_code::action_code,         -- also cast action_code enum
    p_comments,
    v_review_step,
    NOW(),
    NOW(),
    NOW()
  )
  RETURNING id INTO v_review_id;

  -- ── 6) Write audit log entry ──
  INSERT INTO audit_logs (
    entity_type,
    entity_id,
    action,
    performed_by,
    old_value,
    new_value
  ) VALUES (
    'submittal',
    p_submittal_id,
    'review_submit',
    p_user_id,
    jsonb_build_object('status', v_submittal.status, 'stage', v_submittal.submittal_stage),
    jsonb_build_object(
      'action_code',    p_action_code,
      'reviewer_role',  v_reviewer_role,
      'review_step',    v_review_step,
      'review_id',      v_review_id::TEXT,
      'comments',       COALESCE(p_comments, '')
    )
  );

  RAISE NOTICE '[record_review_comment] SUCCESS review_id=%, step=%', v_review_id, v_review_step;

  RETURN jsonb_build_object(
    'success',      true,
    'review_id',    v_review_id,
    'review_step',  v_review_step,
    'reviewer_role', v_reviewer_role,
    'action_code',  p_action_code
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[record_review_comment] FAILED: % — %', SQLSTATE, SQLERRM;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.record_review_comment(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_review_comment(UUID, UUID, TEXT, TEXT) TO service_role;
