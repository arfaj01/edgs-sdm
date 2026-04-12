-- ============================================================================
-- Migration 012 — COMPLETE REBUILD of execute_workflow_transition
-- ============================================================================
-- STATUS: Production Recovery
-- REASON: Previous RPC (from migrations 001-007) is a Black Box that fails
--         silently. This migration replaces it entirely.
--
-- DESIGN PRINCIPLES:
--   1. Uses ONLY columns verified to exist in the base schema
--   2. Zero dependency on migration 008 columns (assigned_role,
--      current_stage_started_at, due_at, next_action, overdue_flag)
--   3. If migration 008 trigger exists, it will fire and set those columns
--      automatically — no conflict
--   4. Full logging via RAISE NOTICE at every decision point
--   5. Explicit error messages in Arabic for user-facing failures
--
-- WORKFLOW IMPLEMENTED:
--   Submitter → Technical Unit → Quality Unit → Project Manager → Approved
--   Any stage can return to Submitter (action_code C) or reject (action_code D)
--
-- COLUMNS WRITTEN BY THIS RPC:
--   submittals.status              (submittal_status enum — verified exists)
--   submittals.submittal_stage     (TEXT — no enum type, stores stage name directly)
--   submittals.assigned_to_user_id (UUID — added below if missing)
--   submittals.submitted_at        (TIMESTAMPTZ — verified exists)
--   submittals.updated_at          (TIMESTAMPTZ — verified exists)
--
-- TRIGGERS SUPPORTED:
--   consultant_submit   — submitter submits (draft→submitted)
--   consultant_resubmit — submitter resubmits (revision_required→resubmitted)
--   coordinator_pickup  — technical picks up (submitted→under_review)
--   reviewer_return     — reviewer returns (under_review→revision_required)
--   reviewer_reject     — reviewer rejects (under_review→rejected)
--   owner_approve       — stage advance or final approval
--   owner_reject        — rejection at any stage
-- ============================================================================

-- ── Step 0: Ensure assigned_to_user_id column exists ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'submittals'
      AND column_name  = 'assigned_to_user_id'
  ) THEN
    ALTER TABLE public.submittals
      ADD COLUMN assigned_to_user_id UUID REFERENCES public.users(id);
    RAISE NOTICE '[012] Added assigned_to_user_id column to submittals';
  ELSE
    RAISE NOTICE '[012] assigned_to_user_id column already exists';
  END IF;
END $$;

-- ── Step 1: DROP old function to avoid signature conflicts ───────────
-- Using DROP + CREATE instead of CREATE OR REPLACE for clean slate
DROP FUNCTION IF EXISTS public.execute_workflow_transition(UUID, TEXT, UUID, TEXT, TEXT);

-- ── Step 2: CREATE the function from scratch ─────────────────────────
CREATE FUNCTION public.execute_workflow_transition(
  p_submittal_id   UUID,
  p_trigger_name   TEXT,
  p_user_id        UUID,
  p_action_code    TEXT DEFAULT NULL,
  p_comments       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Submittal state
  v_current_status TEXT;
  v_current_stage  TEXT;
  v_deliverable_id UUID;
  v_submitted_by   UUID;

  -- Derived project
  v_phase_id       UUID;
  v_project_id     UUID;

  -- Transition targets
  v_new_status     TEXT;
  v_new_stage      TEXT;
  v_target_role    TEXT;

  -- Assigned user
  v_assigned_user_id UUID;
  v_assigned_name    TEXT;

  -- Notification
  v_notif_title    TEXT;
  v_notif_message  TEXT;
BEGIN
  -- ══════════════════════════════════════════════════════════════════
  -- PHASE 1: LOAD AND LOCK THE SUBMITTAL
  -- ══════════════════════════════════════════════════════════════════
  RAISE NOTICE '[WF] ══ START ══ submittal=% trigger=% user=% action=%',
    p_submittal_id, p_trigger_name, p_user_id, p_action_code;

  SELECT
    s.status::TEXT,
    s.submittal_stage::TEXT,
    s.deliverable_id,
    s.submitted_by
  INTO
    v_current_status,
    v_current_stage,
    v_deliverable_id,
    v_submitted_by
  FROM submittals s
  WHERE s.id = p_submittal_id
    AND s.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE '[WF] ERROR: Submittal not found: %', p_submittal_id;
    RETURN jsonb_build_object(
      'success', false,
      'error',   'الطلب غير موجود: ' || p_submittal_id::TEXT
    );
  END IF;

  RAISE NOTICE '[WF] Loaded: status=% stage=% deliverable=%',
    v_current_status, v_current_stage, v_deliverable_id;

  -- ══════════════════════════════════════════════════════════════════
  -- PHASE 2: RESOLVE PROJECT_ID via deliverables → phases
  -- ══════════════════════════════════════════════════════════════════
  SELECT d.phase_id INTO v_phase_id
  FROM deliverables d
  WHERE d.id = v_deliverable_id;

  IF v_phase_id IS NULL THEN
    RAISE NOTICE '[WF] ERROR: Deliverable % has no phase', v_deliverable_id;
    RETURN jsonb_build_object(
      'success', false,
      'error',   'المُخرج غير مرتبط بمرحلة'
    );
  END IF;

  SELECT p.project_id INTO v_project_id
  FROM phases p
  WHERE p.id = v_phase_id;

  IF v_project_id IS NULL THEN
    RAISE NOTICE '[WF] ERROR: Phase % has no project', v_phase_id;
    RETURN jsonb_build_object(
      'success', false,
      'error',   'المرحلة غير مرتبطة بمشروع'
    );
  END IF;

  RAISE NOTICE '[WF] Resolved: phase=% project=%', v_phase_id, v_project_id;

  -- ══════════════════════════════════════════════════════════════════
  -- PHASE 3: DETERMINE TRANSITION (state machine)
  -- ══════════════════════════════════════════════════════════════════
  CASE p_trigger_name

    -- ────────────────────────────────────────────────────────────────
    -- CONSULTANT_SUBMIT: Submitter submits for first review
    -- draft → submitted  |  revision_required → resubmitted
    -- Next stage: technical
    -- ────────────────────────────────────────────────────────────────
    WHEN 'consultant_submit' THEN
      IF v_current_status = 'draft' THEN
        v_new_status := 'submitted';
      ELSIF v_current_status = 'revision_required' THEN
        v_new_status := 'resubmitted';
      ELSE
        RAISE NOTICE '[WF] REJECTED: consultant_submit invalid from status=%', v_current_status;
        RETURN jsonb_build_object(
          'success', false,
          'error',   'لا يمكن تقديم الطلب: الحالة الحالية ' || v_current_status || ' — يجب أن تكون draft أو revision_required'
        );
      END IF;
      v_new_stage  := 'technical';
      v_target_role := 'technical_unit';
      RAISE NOTICE '[WF] TRANSITION: consultant_submit → status=% stage=%', v_new_status, v_new_stage;

    -- ────────────────────────────────────────────────────────────────
    -- CONSULTANT_RESUBMIT: Resubmit after revision
    -- revision_required → resubmitted, stage=technical
    -- ────────────────────────────────────────────────────────────────
    WHEN 'consultant_resubmit' THEN
      IF v_current_status <> 'revision_required' THEN
        RETURN jsonb_build_object(
          'success', false,
          'error',   'لا يمكن إعادة التقديم: الحالة الحالية ' || v_current_status
        );
      END IF;
      v_new_status  := 'resubmitted';
      v_new_stage   := 'technical';
      v_target_role := 'technical_unit';
      RAISE NOTICE '[WF] TRANSITION: consultant_resubmit → resubmitted/technical';

    -- ────────────────────────────────────────────────────────────────
    -- COORDINATOR_PICKUP: Technical unit picks up for review
    -- submitted/resubmitted → under_review
    -- ────────────────────────────────────────────────────────────────
    WHEN 'coordinator_pickup' THEN
      IF v_current_status NOT IN ('submitted', 'resubmitted') THEN
        RETURN jsonb_build_object(
          'success', false,
          'error',   'لا يمكن استلام الطلب: الحالة الحالية ' || v_current_status
        );
      END IF;
      v_new_status  := 'under_review';
      v_new_stage   := COALESCE(v_current_stage, 'technical');
      -- Keep same assignee based on current stage
      v_target_role := CASE v_new_stage
        WHEN 'technical' THEN 'technical_unit'
        WHEN 'quality'   THEN 'quality_unit'
        WHEN 'pm'        THEN 'project_manager'
        ELSE 'technical_unit'
      END;
      RAISE NOTICE '[WF] TRANSITION: coordinator_pickup → under_review/% (role=%)', v_new_stage, v_target_role;

    -- ────────────────────────────────────────────────────────────────
    -- OWNER_APPROVE: Advance to next stage or final approval
    -- action_code A or B required
    -- technical → quality | quality → pm | pm → approved
    -- ────────────────────────────────────────────────────────────────
    WHEN 'owner_approve' THEN
      IF v_current_status NOT IN ('submitted', 'resubmitted', 'under_review') THEN
        RETURN jsonb_build_object(
          'success', false,
          'error',   'لا يمكن الموافقة: الحالة الحالية ' || v_current_status
        );
      END IF;
      IF p_action_code IS NULL OR p_action_code NOT IN ('A', 'B') THEN
        RETURN jsonb_build_object(
          'success', false,
          'error',   'الموافقة تتطلب رمز إجراء A أو B'
        );
      END IF;

      -- Determine next stage based on CURRENT stage
      IF v_current_stage = 'technical' OR v_current_stage IS NULL THEN
        -- Technical approves → advance to Quality
        v_new_status  := 'under_review';
        v_new_stage   := 'quality';
        v_target_role := 'quality_unit';
        RAISE NOTICE '[WF] TRANSITION: owner_approve at technical → quality';
      ELSIF v_current_stage = 'quality' THEN
        -- Quality approves → advance to PM
        v_new_status  := 'under_review';
        v_new_stage   := 'pm';
        v_target_role := 'project_manager';
        RAISE NOTICE '[WF] TRANSITION: owner_approve at quality → pm';
      ELSIF v_current_stage = 'pm' THEN
        -- PM approves → FINAL APPROVAL
        v_new_status  := 'approved';
        v_new_stage   := NULL;
        v_target_role := NULL;
        RAISE NOTICE '[WF] TRANSITION: owner_approve at pm → APPROVED (final)';
      ELSE
        RETURN jsonb_build_object(
          'success', false,
          'error',   'مرحلة غير متوقعة للموافقة: ' || COALESCE(v_current_stage, 'NULL')
        );
      END IF;

    -- ────────────────────────────────────────────────────────────────
    -- REVIEWER_RETURN: Return to submitter for corrections
    -- action_code B or C required
    -- under_review → revision_required, stage=returned
    -- ────────────────────────────────────────────────────────────────
    WHEN 'reviewer_return' THEN
      IF v_current_status NOT IN ('submitted', 'resubmitted', 'under_review') THEN
        RETURN jsonb_build_object(
          'success', false,
          'error',   'لا يمكن إرجاع الطلب: الحالة الحالية ' || v_current_status
        );
      END IF;
      IF p_action_code IS NULL OR p_action_code NOT IN ('B', 'C') THEN
        RETURN jsonb_build_object(
          'success', false,
          'error',   'الإرجاع يتطلب رمز إجراء B أو C'
        );
      END IF;
      v_new_status  := 'revision_required';
      v_new_stage   := 'returned';
      v_target_role := 'submitter';
      RAISE NOTICE '[WF] TRANSITION: reviewer_return → revision_required/returned';

    -- ────────────────────────────────────────────────────────────────
    -- REVIEWER_REJECT: Reject the submittal
    -- action_code D required
    -- ────────────────────────────────────────────────────────────────
    WHEN 'reviewer_reject' THEN
      IF v_current_status NOT IN ('submitted', 'resubmitted', 'under_review') THEN
        RETURN jsonb_build_object(
          'success', false,
          'error',   'لا يمكن رفض الطلب: الحالة الحالية ' || v_current_status
        );
      END IF;
      IF p_action_code IS NULL OR p_action_code <> 'D' THEN
        RETURN jsonb_build_object(
          'success', false,
          'error',   'الرفض يتطلب رمز إجراء D'
        );
      END IF;
      v_new_status  := 'rejected';
      v_new_stage   := NULL;
      v_target_role := NULL;
      RAISE NOTICE '[WF] TRANSITION: reviewer_reject → rejected';

    -- ────────────────────────────────────────────────────────────────
    -- OWNER_REJECT: Rejection by PM/Owner
    -- ────────────────────────────────────────────────────────────────
    WHEN 'owner_reject' THEN
      IF v_current_status NOT IN ('submitted', 'resubmitted', 'under_review') THEN
        RETURN jsonb_build_object(
          'success', false,
          'error',   'لا يمكن رفض الطلب: الحالة الحالية ' || v_current_status
        );
      END IF;
      v_new_status  := 'rejected';
      v_new_stage   := NULL;
      v_target_role := NULL;
      RAISE NOTICE '[WF] TRANSITION: owner_reject → rejected';

    -- ────────────────────────────────────────────────────────────────
    -- UNKNOWN TRIGGER
    -- ────────────────────────────────────────────────────────────────
    ELSE
      RAISE NOTICE '[WF] ERROR: Unknown trigger: %', p_trigger_name;
      RETURN jsonb_build_object(
        'success', false,
        'error',   'إجراء غير معروف: ' || p_trigger_name
      );
  END CASE;

  -- ══════════════════════════════════════════════════════════════════
  -- PHASE 4: FIND ASSIGNED USER from project_members
  -- ══════════════════════════════════════════════════════════════════
  IF v_target_role IS NOT NULL THEN
    RAISE NOTICE '[WF] Looking up user with role=% in project=%', v_target_role, v_project_id;

    IF v_target_role = 'submitter' THEN
      -- Return to original submitter
      SELECT u.id, COALESCE(u.full_name, u.full_name_ar, u.email)
        INTO v_assigned_user_id, v_assigned_name
        FROM users u
       WHERE u.id = v_submitted_by
         AND u.is_active = true;

      -- Fallback: try 'consultant' role in project_members
      IF v_assigned_user_id IS NULL THEN
        SELECT pm.user_id, COALESCE(u.full_name, u.full_name_ar, u.email)
          INTO v_assigned_user_id, v_assigned_name
          FROM project_members pm
          JOIN users u ON u.id = pm.user_id AND u.is_active = true
         WHERE pm.project_id = v_project_id
           AND pm.role::TEXT IN ('submitter', 'consultant')
         LIMIT 1;
      END IF;
    ELSE
      -- Look up by canonical role
      SELECT pm.user_id, COALESCE(u.full_name, u.full_name_ar, u.email)
        INTO v_assigned_user_id, v_assigned_name
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id AND u.is_active = true
       WHERE pm.project_id = v_project_id
         AND pm.role::TEXT = v_target_role
       LIMIT 1;

      -- Fallback: try legacy role aliases
      IF v_assigned_user_id IS NULL AND v_target_role = 'technical_unit' THEN
        SELECT pm.user_id, COALESCE(u.full_name, u.full_name_ar, u.email)
          INTO v_assigned_user_id, v_assigned_name
          FROM project_members pm
          JOIN users u ON u.id = pm.user_id AND u.is_active = true
         WHERE pm.project_id = v_project_id
           AND pm.role::TEXT = 'project_coordinator'
         LIMIT 1;
        IF v_assigned_user_id IS NOT NULL THEN
          RAISE NOTICE '[WF] Fallback: used project_coordinator as technical_unit';
        END IF;
      END IF;

      IF v_assigned_user_id IS NULL AND v_target_role = 'project_manager' THEN
        SELECT pm.user_id, COALESCE(u.full_name, u.full_name_ar, u.email)
          INTO v_assigned_user_id, v_assigned_name
          FROM project_members pm
          JOIN users u ON u.id = pm.user_id AND u.is_active = true
         WHERE pm.project_id = v_project_id
           AND pm.role::TEXT IN ('owner', 'department_director')
         LIMIT 1;
        IF v_assigned_user_id IS NOT NULL THEN
          RAISE NOTICE '[WF] Fallback: used owner/director as project_manager';
        END IF;
      END IF;
    END IF;

    RAISE NOTICE '[WF] Assigned: user_id=% name=%', v_assigned_user_id, v_assigned_name;

    -- Hard fail if no user found for a required reviewer role
    IF v_assigned_user_id IS NULL THEN
      RAISE NOTICE '[WF] FATAL: No user found for role=% in project=%', v_target_role, v_project_id;
      RETURN jsonb_build_object(
        'success', false,
        'error',   'لا يوجد مستخدم بدور "' || v_target_role || '" في هذا المشروع (project_id: ' || v_project_id::TEXT || '). يرجى إضافة عضو بالدور المطلوب أولاً.'
      );
    END IF;
  ELSE
    -- Terminal state (approved/rejected) — no assignment needed
    v_assigned_user_id := NULL;
    v_assigned_name    := NULL;
    RAISE NOTICE '[WF] Terminal state — no user assignment';
  END IF;

  -- ══════════════════════════════════════════════════════════════════
  -- PHASE 5: UPDATE SUBMITTAL (only verified columns)
  -- ══════════════════════════════════════════════════════════════════
  RAISE NOTICE '[WF] Updating submittal: status=% → % | stage=% → % | assigned=%',
    v_current_status, v_new_status, v_current_stage, v_new_stage, v_assigned_user_id;

  -- NOTE: submittal_status is a verified enum type
  --       submittal_stage is TEXT (no enum exists for it)
  UPDATE submittals
     SET status              = v_new_status::submittal_status,
         submittal_stage     = v_new_stage,
         assigned_to_user_id = v_assigned_user_id,
         submitted_at        = CASE
                                 WHEN v_new_status IN ('submitted', 'resubmitted')
                                  AND submitted_at IS NULL
                                 THEN NOW()
                                 ELSE submitted_at
                               END,
         updated_at          = NOW()
   WHERE id = p_submittal_id;

  RAISE NOTICE '[WF] Submittal updated successfully';

  -- ══════════════════════════════════════════════════════════════════
  -- PHASE 6: AUDIT LOG (only verified columns: old_value, new_value)
  -- ══════════════════════════════════════════════════════════════════
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
    'status_change',
    p_user_id,
    jsonb_build_object(
      'status',          v_current_status,
      'submittal_stage', v_current_stage
    ),
    jsonb_build_object(
      'status',             v_new_status,
      'submittal_stage',    v_new_stage,
      'trigger',            p_trigger_name,
      'action_code',        p_action_code,
      'assigned_to_user',   v_assigned_name,
      'assigned_to_user_id', v_assigned_user_id
    )
  );

  RAISE NOTICE '[WF] Audit log created';

  -- ══════════════════════════════════════════════════════════════════
  -- PHASE 7: NOTIFICATION (Arabic, for assigned user)
  -- ══════════════════════════════════════════════════════════════════
  IF v_assigned_user_id IS NOT NULL AND v_assigned_user_id <> p_user_id THEN
    CASE p_trigger_name
      WHEN 'consultant_submit' THEN
        v_notif_title   := 'طلب جديد للمراجعة الفنية';
        v_notif_message := 'تم تقديم طلب جديد ويحتاج مراجعتك — المرحلة: الجهة الفنية';
      WHEN 'consultant_resubmit' THEN
        v_notif_title   := 'إعادة تقديم طلب';
        v_notif_message := 'تمت إعادة تقديم طلب بعد التعديل ويحتاج مراجعتك';
      WHEN 'coordinator_pickup' THEN
        v_notif_title   := 'تم استلام الطلب للمراجعة';
        v_notif_message := 'تم استلام طلبك وبدأت المراجعة';
      WHEN 'owner_approve' THEN
        IF v_new_stage = 'quality' THEN
          v_notif_title   := 'طلب يحتاج مراجعة الجودة';
          v_notif_message := 'تمت الموافقة الفنية — يحتاج مراجعة الجودة الآن';
        ELSIF v_new_stage = 'pm' THEN
          v_notif_title   := 'طلب يحتاج موافقة مدير المشروع';
          v_notif_message := 'تمت مراجعة الجودة — يحتاج موافقة مدير المشروع';
        ELSE
          v_notif_title   := 'تمت الموافقة النهائية';
          v_notif_message := 'تمت الموافقة النهائية على الطلب';
        END IF;
      WHEN 'reviewer_return' THEN
        v_notif_title   := 'طلب يحتاج تعديل';
        v_notif_message := 'تم إرجاع طلبك ويحتاج تعديلات — يرجى المراجعة وإعادة التقديم';
      WHEN 'reviewer_reject' THEN
        v_notif_title   := 'تم رفض الطلب';
        v_notif_message := 'تم رفض طلبك — يرجى مراجعة الملاحظات';
      WHEN 'owner_reject' THEN
        v_notif_title   := 'تم رفض الطلب';
        v_notif_message := 'تم رفض الطلب من قبل مدير المشروع';
      ELSE
        v_notif_title   := 'تحديث على طلب';
        v_notif_message := 'تم تحديث حالة طلب مرتبط بك';
    END CASE;

    INSERT INTO notifications (user_id, title, message, entity_type, entity_id)
    VALUES (v_assigned_user_id, v_notif_title, v_notif_message, 'submittal', p_submittal_id);

    RAISE NOTICE '[WF] Notification created for user=%: %', v_assigned_user_id, v_notif_title;
  ELSE
    RAISE NOTICE '[WF] No notification: assigned=% performer=%', v_assigned_user_id, p_user_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════════
  -- PHASE 8: RETURN SUCCESS
  -- ══════════════════════════════════════════════════════════════════
  RAISE NOTICE '[WF] ══ SUCCESS ══ % → % | stage: % → % | assigned: %',
    v_current_status, v_new_status, v_current_stage, v_new_stage, v_assigned_name;

  RETURN jsonb_build_object(
    'success',        true,
    'old_status',     v_current_status,
    'new_status',     v_new_status,
    'old_stage',      v_current_stage,
    'new_stage',      v_new_stage,
    'trigger',        p_trigger_name,
    'action_code',    p_action_code,
    'submittal_id',   p_submittal_id,
    'assigned_to',    v_assigned_name,
    'assigned_role',  v_target_role,
    'project_id',     v_project_id
  );

END;
$$;

-- ── Permissions ──────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.execute_workflow_transition(UUID, TEXT, UUID, TEXT, TEXT)
  TO authenticated, service_role;

DO $$ BEGIN RAISE NOTICE '[012] execute_workflow_transition rebuilt successfully'; END $$;
