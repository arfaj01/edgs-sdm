/**
 * Smart Workflow Automation — client-side SLA and routing helpers.
 *
 * This file is the single source of truth for:
 *   - Default SLA hours per stage
 *   - Computing due_at / overdue from a submittal
 *   - Auto-routing: which role owns the next action for a given (status, stage)
 *   - What the next_action label key is for a given (status, stage)
 *
 * Everything here is PURE and derivable from submittal columns that already
 * exist in the DB (`status`, `submittal_stage`, `submitted_at`, `updated_at`).
 * A companion SQL migration (`008_smart_workflow.sql`) mirrors this logic
 * server-side for RLS-safe queries, but the UI does not depend on that
 * migration being applied — it falls back to client-side computation.
 */

import type { SubmittalStatus, SubmittalStage, UserRole } from '@/types/database';

// ────────────────────────────────────────────────────────────
// SLA CONFIGURATION
// ────────────────────────────────────────────────────────────

/**
 * Default review window per stage, in hours. These are tuned for ministry
 * engineering review cycles. Tune centrally here when policy changes.
 */
export const SLA_HOURS_BY_STAGE: Record<'technical' | 'quality' | 'pm', number> = {
  technical: 48, // 2 business days
  quality: 24, // 1 business day
  pm: 48, // 2 business days
};

/**
 * How soon before due time a submittal is considered "approaching due"
 * (used for yellow warning styling). Default 6 hours.
 */
export const APPROACHING_DUE_BUFFER_HOURS = 6;

// ────────────────────────────────────────────────────────────
// DERIVED STATE
// ────────────────────────────────────────────────────────────

export type StageKey = 'technical' | 'quality' | 'pm';

export interface WorkflowState {
  /** ISO timestamp the current stage started (falls back to submitted_at, then updated_at) */
  stageStartedAt: string | null;
  /** ISO timestamp the current stage is due by, or null if no active stage */
  dueAt: string | null;
  /** Hours remaining until due_at, negative if overdue */
  hoursRemaining: number | null;
  /** True iff the submittal is past its current-stage SLA */
  overdue: boolean;
  /** True iff due within APPROACHING_DUE_BUFFER_HOURS */
  approaching: boolean;
  /** Canonical role that currently owns the next action, or null for terminal states */
  assignedRole: UserRole | null;
  /** i18n key describing the next required action */
  nextActionKey: string | null;
  /** Stage the submittal is sitting in right now (for overdue / highlighting). */
  activeStage: StageKey | null;
}

/**
 * Return the canonical role that currently owns the submittal, or null
 * if the submittal is in a terminal (approved/rejected) or drafting state.
 *
 * This matches the 3-stage workflow: submitter → technical → quality → pm → approved.
 */
export function computeAssignedRole(
  status: SubmittalStatus,
  stage: SubmittalStage,
): UserRole | null {
  if (status === 'approved' || status === 'rejected') return null;
  if (status === 'draft') return 'submitter';
  if (status === 'revision_required') return 'submitter';

  // under_review / submitted / resubmitted → routed by stage
  if (stage === 'technical') return 'technical_unit';
  if (stage === 'quality') return 'quality_unit';
  if (stage === 'pm') return 'project_manager';
  if (stage === 'returned') return 'submitter';

  // submitted but no stage set yet → default to technical
  if (status === 'submitted' || status === 'resubmitted') return 'technical_unit';
  if (status === 'under_review') return 'technical_unit';

  return null;
}

/**
 * Return the i18n key describing the next required action.
 */
export function computeNextActionKey(
  status: SubmittalStatus,
  stage: SubmittalStage,
): string | null {
  if (status === 'approved') return 'workflowAuto.actionApproved';
  if (status === 'rejected') return 'workflowAuto.actionRejected';
  if (status === 'draft') return 'workflowAuto.actionDraftSubmit';
  if (status === 'revision_required') return 'workflowAuto.actionRevisionRequired';
  if (stage === 'technical') return 'workflowAuto.actionTechnicalReview';
  if (stage === 'quality') return 'workflowAuto.actionQualityReview';
  if (stage === 'pm') return 'workflowAuto.actionPMApproval';
  if (stage === 'returned') return 'workflowAuto.actionReturned';
  // default to technical review
  if (status === 'submitted' || status === 'resubmitted' || status === 'under_review') {
    return 'workflowAuto.actionTechnicalReview';
  }
  return null;
}

/**
 * Return the stage the submittal is currently sitting in, or null if it
 * has no active review stage (terminal or pre-submit states).
 */
export function computeActiveStage(
  status: SubmittalStatus,
  stage: SubmittalStage,
): StageKey | null {
  if (status === 'approved' || status === 'rejected') return null;
  if (status === 'draft' || status === 'revision_required') return null;
  if (stage === 'technical') return 'technical';
  if (stage === 'quality') return 'quality';
  if (stage === 'pm') return 'pm';
  if (stage === 'returned') return null;
  // submitted/resubmitted/under_review with no stage → default to technical
  return 'technical';
}

/**
 * Compute due_at and overdue state from a submittal's raw fields.
 *
 * @param submittal  Minimal subset of the submittal shape needed for SLA.
 * @param now        Optional reference "now" for testing / SSR.
 */
export function computeWorkflowState(
  submittal: {
    status: SubmittalStatus;
    submittal_stage: SubmittalStage;
    submitted_at: string | null;
    updated_at: string;
  },
  now: Date = new Date(),
): WorkflowState {
  const activeStage = computeActiveStage(
    submittal.status,
    submittal.submittal_stage,
  );
  const assignedRole = computeAssignedRole(
    submittal.status,
    submittal.submittal_stage,
  );
  const nextActionKey = computeNextActionKey(
    submittal.status,
    submittal.submittal_stage,
  );

  // For stage SLA purposes, anchor on the most recent state change we
  // can observe: updated_at is bumped by the status-change trigger, so it
  // is the best available proxy for "stage started at" until the
  // additive migration adds a dedicated column.
  const stageStartedAt = activeStage
    ? submittal.updated_at || submittal.submitted_at
    : null;

  if (!activeStage || !stageStartedAt) {
    return {
      stageStartedAt,
      dueAt: null,
      hoursRemaining: null,
      overdue: false,
      approaching: false,
      assignedRole,
      nextActionKey,
      activeStage,
    };
  }

  const slaHours = SLA_HOURS_BY_STAGE[activeStage];
  const startedMs = new Date(stageStartedAt).getTime();
  const dueMs = startedMs + slaHours * 60 * 60 * 1000;
  const remainingMs = dueMs - now.getTime();
  const hoursRemaining = remainingMs / (60 * 60 * 1000);

  return {
    stageStartedAt,
    dueAt: new Date(dueMs).toISOString(),
    hoursRemaining,
    overdue: hoursRemaining < 0,
    approaching: hoursRemaining >= 0 && hoursRemaining <= APPROACHING_DUE_BUFFER_HOURS,
    assignedRole,
    nextActionKey,
    activeStage,
  };
}

/**
 * Format the "time remaining" / "time overdue" for display. Returns a
 * structured result so callers can apply their own i18n + styling.
 */
export function formatTimeRemaining(hoursRemaining: number | null): {
  magnitude: number;
  unit: 'hour' | 'day';
  overdue: boolean;
} | null {
  if (hoursRemaining === null) return null;
  const overdue = hoursRemaining < 0;
  const absHours = Math.abs(hoursRemaining);
  if (absHours >= 24) {
    return { magnitude: Math.round(absHours / 24), unit: 'day', overdue };
  }
  return { magnitude: Math.max(1, Math.round(absHours)), unit: 'hour', overdue };
}

/**
 * Role-aware role-matching: accepts a user's role and returns whether
 * they can act on a submittal whose current assigned role is `assignedRole`.
 * Handles legacy role aliases (consultant ↔ submitter, project_coordinator
 * ↔ technical_unit, owner ↔ project_manager/department_director).
 */
export function userCanActOnRole(
  userRole: UserRole | null | undefined,
  assignedRole: UserRole | null,
): boolean {
  if (!userRole || !assignedRole) return false;
  if (userRole === assignedRole) return true;
  // legacy aliases
  if (assignedRole === 'submitter' && userRole === 'consultant') return true;
  if (assignedRole === 'technical_unit' && userRole === 'project_coordinator')
    return true;
  if (assignedRole === 'project_manager' && userRole === 'owner') return true;
  // admins and directors can act on anything
  if (userRole === 'admin' || userRole === 'department_director') return true;
  return false;
}
