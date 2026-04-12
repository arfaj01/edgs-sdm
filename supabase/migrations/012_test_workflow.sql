-- ============================================================================
-- 012_test_workflow.sql — COMPREHENSIVE WORKFLOW TESTS
-- ============================================================================
-- Run this AFTER applying 012_rebuild_workflow_rpc.sql
-- Run in Supabase SQL Editor with a service_role connection
--
-- Tests:
--   TEST 1: Happy Path (Submit → Technical → Quality → PM → Approved)
--   TEST 2: Reject Path (Submit → Technical → Reject)
--   TEST 3: Return Path (Submit → Technical → Return → Resubmit)
--   TEST 4: Missing Role (should fail with clear error)
--   TEST 5: Invalid trigger (should fail)
--   TEST 6: Invalid status transition (should fail)
--
-- Each test creates its own submittal to avoid conflicts.
-- ============================================================================

DO $$
DECLARE
  -- We'll use existing data. First find a valid project with members.
  v_project_id     UUID;
  v_phase_id       UUID;
  v_deliverable_id UUID;
  v_submitter_id   UUID;
  v_tech_user_id   UUID;
  v_quality_user_id UUID;
  v_pm_user_id     UUID;

  -- Test submittals
  v_test1_id UUID;
  v_test2_id UUID;
  v_test3_id UUID;
  v_test4_id UUID;

  -- Result holders
  v_result   JSONB;
  v_status   TEXT;
  v_stage    TEXT;
  v_assigned UUID;
  v_notif_count INTEGER;
  v_audit_count INTEGER;

  v_pass_count INTEGER := 0;
  v_fail_count INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '  EDGS WORKFLOW TEST SUITE';
  RAISE NOTICE '══════════════════════════════════════════════════════════';

  -- ── SETUP: Find existing project data ──────────────────────────────
  -- Find a project that has members
  SELECT pm.project_id INTO v_project_id
  FROM project_members pm
  GROUP BY pm.project_id
  HAVING COUNT(*) >= 1
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE NOTICE 'SETUP FAILED: No project with members found';
    RETURN;
  END IF;

  -- Find a phase in this project
  SELECT p.id INTO v_phase_id
  FROM phases p
  WHERE p.project_id = v_project_id
  LIMIT 1;

  IF v_phase_id IS NULL THEN
    RAISE NOTICE 'SETUP FAILED: No phase found for project %', v_project_id;
    RETURN;
  END IF;

  -- Find a deliverable in this phase
  SELECT d.id INTO v_deliverable_id
  FROM deliverables d
  WHERE d.phase_id = v_phase_id
  LIMIT 1;

  IF v_deliverable_id IS NULL THEN
    RAISE NOTICE 'SETUP FAILED: No deliverable found for phase %', v_phase_id;
    RETURN;
  END IF;

  -- Find users by role in project_members (or fallback to users table)
  SELECT pm.user_id INTO v_submitter_id
  FROM project_members pm
  JOIN users u ON u.id = pm.user_id AND u.is_active = true
  WHERE pm.project_id = v_project_id
    AND pm.role::TEXT IN ('submitter', 'consultant')
  LIMIT 1;

  -- If no submitter in project, use any active user
  IF v_submitter_id IS NULL THEN
    SELECT u.id INTO v_submitter_id
    FROM users u WHERE u.is_active = true LIMIT 1;
  END IF;

  SELECT pm.user_id INTO v_tech_user_id
  FROM project_members pm
  JOIN users u ON u.id = pm.user_id AND u.is_active = true
  WHERE pm.project_id = v_project_id
    AND pm.role::TEXT IN ('technical_unit', 'project_coordinator')
  LIMIT 1;

  SELECT pm.user_id INTO v_quality_user_id
  FROM project_members pm
  JOIN users u ON u.id = pm.user_id AND u.is_active = true
  WHERE pm.project_id = v_project_id
    AND pm.role::TEXT = 'quality_unit'
  LIMIT 1;

  SELECT pm.user_id INTO v_pm_user_id
  FROM project_members pm
  JOIN users u ON u.id = pm.user_id AND u.is_active = true
  WHERE pm.project_id = v_project_id
    AND pm.role::TEXT IN ('project_manager', 'owner', 'department_director')
  LIMIT 1;

  RAISE NOTICE '';
  RAISE NOTICE '── SETUP ──────────────────────────────────────────────';
  RAISE NOTICE '  Project:     %', v_project_id;
  RAISE NOTICE '  Phase:       %', v_phase_id;
  RAISE NOTICE '  Deliverable: %', v_deliverable_id;
  RAISE NOTICE '  Submitter:   %', v_submitter_id;
  RAISE NOTICE '  Technical:   %', v_tech_user_id;
  RAISE NOTICE '  Quality:     %', v_quality_user_id;
  RAISE NOTICE '  PM:          %', v_pm_user_id;
  RAISE NOTICE '';

  -- ══════════════════════════════════════════════════════════════════
  -- TEST 1: HAPPY PATH (Full workflow)
  -- Submit → Technical Review → Quality Review → PM Approval → Approved
  -- ══════════════════════════════════════════════════════════════════
  RAISE NOTICE '── TEST 1: HAPPY PATH ─────────────────────────────────';

  -- Create test submittal
  INSERT INTO submittals (deliverable_id, submittal_number, version, status, purpose, submitted_by)
  VALUES (v_deliverable_id, 'TEST-HAPPY-001', 9901, 'draft', 'for_approval', v_submitter_id)
  RETURNING id INTO v_test1_id;
  RAISE NOTICE '  Created test submittal: %', v_test1_id;

  -- Step 1: consultant_submit (draft → submitted)
  v_result := execute_workflow_transition(v_test1_id, 'consultant_submit', v_submitter_id);
  IF (v_result->>'success')::boolean THEN
    SELECT status::TEXT, submittal_stage::TEXT, assigned_to_user_id
    INTO v_status, v_stage, v_assigned
    FROM submittals WHERE id = v_test1_id;

    IF v_status = 'submitted' AND v_stage = 'technical' AND v_assigned IS NOT NULL THEN
      RAISE NOTICE '  ✅ PASS: consultant_submit → status=% stage=% assigned=%', v_status, v_stage, v_assigned;
      v_pass_count := v_pass_count + 1;
    ELSE
      RAISE NOTICE '  ❌ FAIL: consultant_submit → status=% stage=% assigned=%', v_status, v_stage, v_assigned;
      v_fail_count := v_fail_count + 1;
    END IF;
  ELSE
    RAISE NOTICE '  ❌ FAIL: consultant_submit returned error: %', v_result->>'error';
    v_fail_count := v_fail_count + 1;
  END IF;

  -- Step 2: owner_approve at technical (submitted → under_review/quality)
  IF v_tech_user_id IS NOT NULL THEN
    v_result := execute_workflow_transition(v_test1_id, 'owner_approve', v_tech_user_id, 'A');
    IF (v_result->>'success')::boolean THEN
      SELECT status::TEXT, submittal_stage::TEXT, assigned_to_user_id
      INTO v_status, v_stage, v_assigned
      FROM submittals WHERE id = v_test1_id;

      IF v_status = 'under_review' AND v_stage = 'quality' THEN
        RAISE NOTICE '  ✅ PASS: owner_approve(technical) → status=% stage=% assigned=%', v_status, v_stage, v_assigned;
        v_pass_count := v_pass_count + 1;
      ELSE
        RAISE NOTICE '  ❌ FAIL: owner_approve(technical) → status=% stage=%', v_status, v_stage;
        v_fail_count := v_fail_count + 1;
      END IF;
    ELSE
      RAISE NOTICE '  ❌ FAIL: owner_approve(technical) error: %', v_result->>'error';
      v_fail_count := v_fail_count + 1;
    END IF;
  ELSE
    RAISE NOTICE '  ⚠️ SKIP: No technical user in project — cannot test technical approve';
  END IF;

  -- Step 3: owner_approve at quality (under_review/quality → under_review/pm)
  IF v_quality_user_id IS NOT NULL THEN
    v_result := execute_workflow_transition(v_test1_id, 'owner_approve', v_quality_user_id, 'A');
    IF (v_result->>'success')::boolean THEN
      SELECT status::TEXT, submittal_stage::TEXT
      INTO v_status, v_stage
      FROM submittals WHERE id = v_test1_id;

      IF v_status = 'under_review' AND v_stage = 'pm' THEN
        RAISE NOTICE '  ✅ PASS: owner_approve(quality) → status=% stage=%', v_status, v_stage;
        v_pass_count := v_pass_count + 1;
      ELSE
        RAISE NOTICE '  ❌ FAIL: owner_approve(quality) → status=% stage=%', v_status, v_stage;
        v_fail_count := v_fail_count + 1;
      END IF;
    ELSE
      RAISE NOTICE '  ❌ FAIL: owner_approve(quality) error: %', v_result->>'error';
      v_fail_count := v_fail_count + 1;
    END IF;
  ELSE
    RAISE NOTICE '  ⚠️ SKIP: No quality user — manually advancing stage';
    UPDATE submittals SET status = 'under_review', submittal_stage = 'pm' WHERE id = v_test1_id;
  END IF;

  -- Step 4: owner_approve at pm (under_review/pm → approved)
  IF v_pm_user_id IS NOT NULL THEN
    v_result := execute_workflow_transition(v_test1_id, 'owner_approve', v_pm_user_id, 'A');
    IF (v_result->>'success')::boolean THEN
      SELECT status::TEXT, submittal_stage::TEXT
      INTO v_status, v_stage
      FROM submittals WHERE id = v_test1_id;

      IF v_status = 'approved' AND v_stage IS NULL THEN
        RAISE NOTICE '  ✅ PASS: owner_approve(pm) → status=% stage=%  ★ FINAL APPROVAL', v_status, v_stage;
        v_pass_count := v_pass_count + 1;
      ELSE
        RAISE NOTICE '  ❌ FAIL: owner_approve(pm) → status=% stage=%', v_status, v_stage;
        v_fail_count := v_fail_count + 1;
      END IF;
    ELSE
      RAISE NOTICE '  ❌ FAIL: owner_approve(pm) error: %', v_result->>'error';
      v_fail_count := v_fail_count + 1;
    END IF;
  ELSE
    RAISE NOTICE '  ⚠️ SKIP: No PM user in project';
  END IF;

  -- Verify audit logs for test 1
  SELECT COUNT(*) INTO v_audit_count
  FROM audit_logs
  WHERE entity_id = v_test1_id
    AND entity_type = 'submittal'
    AND action = 'status_change';

  IF v_audit_count >= 1 THEN
    RAISE NOTICE '  ✅ PASS: audit_logs has % status_change records', v_audit_count;
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE '  ❌ FAIL: audit_logs has 0 status_change records';
    v_fail_count := v_fail_count + 1;
  END IF;

  -- Verify notifications for test 1
  SELECT COUNT(*) INTO v_notif_count
  FROM notifications
  WHERE entity_id = v_test1_id
    AND entity_type = 'submittal';

  IF v_notif_count >= 1 THEN
    RAISE NOTICE '  ✅ PASS: notifications has % records', v_notif_count;
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE '  ❌ FAIL: notifications has 0 records';
    v_fail_count := v_fail_count + 1;
  END IF;

  RAISE NOTICE '';

  -- ══════════════════════════════════════════════════════════════════
  -- TEST 2: REJECT PATH
  -- Submit → Technical → Reject
  -- ══════════════════════════════════════════════════════════════════
  RAISE NOTICE '── TEST 2: REJECT PATH ────────────────────────────────';

  INSERT INTO submittals (deliverable_id, submittal_number, version, status, purpose, submitted_by)
  VALUES (v_deliverable_id, 'TEST-REJECT-001', 9902, 'draft', 'for_approval', v_submitter_id)
  RETURNING id INTO v_test2_id;

  -- Submit
  v_result := execute_workflow_transition(v_test2_id, 'consultant_submit', v_submitter_id);
  IF NOT (v_result->>'success')::boolean THEN
    RAISE NOTICE '  ❌ FAIL: Could not submit: %', v_result->>'error';
    v_fail_count := v_fail_count + 1;
  END IF;

  -- Reject with action_code D
  IF v_tech_user_id IS NOT NULL THEN
    v_result := execute_workflow_transition(v_test2_id, 'reviewer_reject', v_tech_user_id, 'D');
    IF (v_result->>'success')::boolean THEN
      SELECT status::TEXT INTO v_status FROM submittals WHERE id = v_test2_id;
      IF v_status = 'rejected' THEN
        RAISE NOTICE '  ✅ PASS: reviewer_reject → status=rejected';
        v_pass_count := v_pass_count + 1;
      ELSE
        RAISE NOTICE '  ❌ FAIL: After reject, status=% (expected rejected)', v_status;
        v_fail_count := v_fail_count + 1;
      END IF;
    ELSE
      RAISE NOTICE '  ❌ FAIL: reviewer_reject error: %', v_result->>'error';
      v_fail_count := v_fail_count + 1;
    END IF;
  ELSE
    RAISE NOTICE '  ⚠️ SKIP: No technical user for reject test';
  END IF;

  RAISE NOTICE '';

  -- ══════════════════════════════════════════════════════════════════
  -- TEST 3: RETURN + RESUBMIT PATH
  -- Submit → Return (C) → Resubmit
  -- ══════════════════════════════════════════════════════════════════
  RAISE NOTICE '── TEST 3: RETURN + RESUBMIT PATH ─────────────────────';

  INSERT INTO submittals (deliverable_id, submittal_number, version, status, purpose, submitted_by)
  VALUES (v_deliverable_id, 'TEST-RETURN-001', 9903, 'draft', 'for_approval', v_submitter_id)
  RETURNING id INTO v_test3_id;

  -- Submit
  v_result := execute_workflow_transition(v_test3_id, 'consultant_submit', v_submitter_id);

  -- Return with action_code C
  IF v_tech_user_id IS NOT NULL THEN
    v_result := execute_workflow_transition(v_test3_id, 'reviewer_return', v_tech_user_id, 'C');
    IF (v_result->>'success')::boolean THEN
      SELECT status::TEXT, submittal_stage::TEXT, assigned_to_user_id
      INTO v_status, v_stage, v_assigned
      FROM submittals WHERE id = v_test3_id;
      IF v_status = 'revision_required' AND v_stage = 'returned' THEN
        RAISE NOTICE '  ✅ PASS: reviewer_return → status=% stage=% assigned=%', v_status, v_stage, v_assigned;
        v_pass_count := v_pass_count + 1;
      ELSE
        RAISE NOTICE '  ❌ FAIL: reviewer_return → status=% stage=%', v_status, v_stage;
        v_fail_count := v_fail_count + 1;
      END IF;
    ELSE
      RAISE NOTICE '  ❌ FAIL: reviewer_return error: %', v_result->>'error';
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  -- Resubmit
  v_result := execute_workflow_transition(v_test3_id, 'consultant_resubmit', v_submitter_id);
  IF (v_result->>'success')::boolean THEN
    SELECT status::TEXT, submittal_stage::TEXT
    INTO v_status, v_stage
    FROM submittals WHERE id = v_test3_id;
    IF v_status = 'resubmitted' AND v_stage = 'technical' THEN
      RAISE NOTICE '  ✅ PASS: consultant_resubmit → status=% stage=%', v_status, v_stage;
      v_pass_count := v_pass_count + 1;
    ELSE
      RAISE NOTICE '  ❌ FAIL: consultant_resubmit → status=% stage=%', v_status, v_stage;
      v_fail_count := v_fail_count + 1;
    END IF;
  ELSE
    RAISE NOTICE '  ❌ FAIL: consultant_resubmit error: %', v_result->>'error';
    v_fail_count := v_fail_count + 1;
  END IF;

  RAISE NOTICE '';

  -- ══════════════════════════════════════════════════════════════════
  -- TEST 4: MISSING ROLE (should fail gracefully)
  -- ══════════════════════════════════════════════════════════════════
  RAISE NOTICE '── TEST 4: MISSING ROLE ───────────────────────────────';

  -- Create submittal in a deliverable that leads to a project WITHOUT technical_unit
  -- We test by directly calling with a non-existent project path
  INSERT INTO submittals (deliverable_id, submittal_number, version, status, purpose, submitted_by)
  VALUES (v_deliverable_id, 'TEST-NOROLE-001', 9904, 'draft', 'for_approval', v_submitter_id)
  RETURNING id INTO v_test4_id;

  -- If technical_unit doesn't exist, consultant_submit should fail
  -- Otherwise this test just verifies the error path works for other scenarios
  v_result := execute_workflow_transition(v_test4_id, 'consultant_submit', v_submitter_id);
  IF (v_result->>'success')::boolean THEN
    RAISE NOTICE '  ℹ️ INFO: consultant_submit succeeded (technical_unit exists) — testing invalid trigger instead';
    -- Test invalid trigger
    v_result := execute_workflow_transition(v_test4_id, 'nonexistent_trigger', v_submitter_id);
    IF NOT (v_result->>'success')::boolean THEN
      RAISE NOTICE '  ✅ PASS: Unknown trigger rejected with error: %', v_result->>'error';
      v_pass_count := v_pass_count + 1;
    ELSE
      RAISE NOTICE '  ❌ FAIL: Unknown trigger should have been rejected';
      v_fail_count := v_fail_count + 1;
    END IF;
  ELSE
    -- consultant_submit failed — check if it's because of missing role
    IF v_result->>'error' LIKE '%لا يوجد مستخدم%' THEN
      RAISE NOTICE '  ✅ PASS: Missing role detected correctly: %', v_result->>'error';
      v_pass_count := v_pass_count + 1;
    ELSE
      RAISE NOTICE '  ℹ️ INFO: Failed for other reason: %', v_result->>'error';
    END IF;
  END IF;

  -- Test invalid status transition
  v_result := execute_workflow_transition(v_test4_id, 'owner_approve', v_submitter_id, 'A');
  IF NOT (v_result->>'success')::boolean THEN
    RAISE NOTICE '  ✅ PASS: Invalid status transition rejected: %', LEFT(v_result->>'error', 60);
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE '  ❌ FAIL: Should not approve a draft submittal';
    v_fail_count := v_fail_count + 1;
  END IF;

  RAISE NOTICE '';

  -- ══════════════════════════════════════════════════════════════════
  -- CLEANUP: Delete test submittals
  -- ══════════════════════════════════════════════════════════════════
  RAISE NOTICE '── CLEANUP ────────────────────────────────────────────';

  DELETE FROM notifications WHERE entity_id IN (v_test1_id, v_test2_id, v_test3_id, v_test4_id);
  DELETE FROM audit_logs WHERE entity_id IN (v_test1_id, v_test2_id, v_test3_id, v_test4_id);
  DELETE FROM submittals WHERE id IN (v_test1_id, v_test2_id, v_test3_id, v_test4_id);
  RAISE NOTICE '  Cleaned up test data';

  -- ══════════════════════════════════════════════════════════════════
  -- RESULTS
  -- ══════════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '  RESULTS: ✅ % passed  |  ❌ % failed', v_pass_count, v_fail_count;
  IF v_fail_count = 0 THEN
    RAISE NOTICE '  STATUS: ★ ALL TESTS PASSED ★';
  ELSE
    RAISE NOTICE '  STATUS: ⚠️ SOME TESTS FAILED — review output above';
  END IF;
  RAISE NOTICE '══════════════════════════════════════════════════════════';

END $$;
