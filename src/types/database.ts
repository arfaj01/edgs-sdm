/**
 * EDGS Database Types
 * Auto-generated TypeScript types matching the PostgreSQL schema exactly
 */

// ============================================================================
// ENUMS (matching database enum types)
// ============================================================================

// Legacy roles preserved for backward compatibility; new roles added in migration 04.
// Canonical roles going forward: submitter, technical_unit, quality_unit, project_manager,
// department_director, admin. consultant/project_coordinator/owner remain valid in DB.
export type UserRole =
  | 'submitter'
  | 'technical_unit'
  | 'quality_unit'
  | 'project_manager'
  | 'department_director'
  | 'admin'
  // legacy
  | 'consultant'
  | 'project_coordinator'
  | 'owner';

export type SubmittalStatus = 'draft' | 'submitted' | 'under_review' | 'revision_required' | 'resubmitted' | 'approved' | 'rejected';

// Multi-stage review tracker (set while status = 'under_review')
// Added in migration 04.
export type SubmittalStage = 'technical' | 'quality' | 'pm' | 'returned' | null;

// Broad request classification. Added in migration 04.
export type RequestType = 'study' | 'execution';

export type ActionCode = 'A' | 'B' | 'C' | 'D';
export type DeliverableFormat = 'PDF' | 'DWG' | 'RVT' | 'XLS' | 'PPTX' | 'DOC' | 'IFC' | 'MIXED';

// 'for_tendering' kept for legacy rows; all new submissions use 'for_information'.
export type SubmittalPurpose = 'for_approval' | 'for_follow_up' | 'for_information' | 'for_tendering';
export type Discipline = 'architectural' | 'structural' | 'civil' | 'mechanical' | 'hvac' | 'plumbing' | 'electrical' | 'reports' | 'general';
export type AuditAction = 'create' | 'update' | 'delete' | 'status_change' | 'review_submit' | 'approval_submit' | 'document_upload' | 'document_delete';
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'cancelled';
export type PhaseStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed';
export type DeliverableStatus = 'not_started' | 'in_progress' | 'submitted' | 'under_review' | 'approved' | 'delayed';

// ============================================================================
// TABLE TYPES
// ============================================================================

/**
 * Users table - System users with roles and permissions
 */
export interface User {
  id: string; // UUID
  email: string;
  full_name: string;
  full_name_ar: string;
  role: UserRole;
  organization: string;
  phone: string;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string; // timestamp
  updated_at: string; // timestamp
  deleted_at: string | null; // timestamp
}

/**
 * Projects table - Top-level project information
 */
export interface Project {
  id: string; // UUID
  code: string; // VARCHAR(20)
  name: string;
  name_ar: string;
  description: string | null;
  description_ar: string | null;
  status: ProjectStatus;
  duration_months: number;
  start_date: string; // DATE
  end_date: string; // DATE
  project_manager_id: string; // UUID
  coordinator_id: string; // UUID
  created_by: string; // UUID
  created_at: string; // timestamp
  updated_at: string; // timestamp
  deleted_at: string | null; // timestamp
}

/**
 * Project members - Users assigned to specific projects with roles
 */
export interface ProjectMember {
  id: string; // UUID
  project_id: string; // UUID
  user_id: string; // UUID
  role: UserRole;
  assigned_at: string; // timestamp
}

/**
 * Phases table - Project phases with status and timeline
 */
export interface Phase {
  id: string; // UUID
  project_id: string; // UUID
  phase_number: number;
  name: string;
  name_ar: string;
  description: string | null;
  description_ar: string | null;
  duration_weeks: number;
  status: PhaseStatus;
  planned_start: string; // DATE
  planned_end: string; // DATE
  actual_start: string | null; // DATE
  actual_end: string | null; // DATE
  sort_order: number;
  created_at: string; // timestamp
  updated_at: string; // timestamp
}

/**
 * Deliverables table - Engineering deliverables within phases
 */
export interface Deliverable {
  id: string; // UUID
  phase_id: string; // UUID
  code: string; // VARCHAR(30)
  name: string;
  name_ar: string;
  description: string | null;
  description_ar: string | null;
  discipline: Discipline;
  format: DeliverableFormat;
  planned_date: string; // DATE
  actual_date: string | null; // DATE
  status: DeliverableStatus;
  sort_order: number;
  created_at: string; // timestamp
  updated_at: string; // timestamp
  deleted_at: string | null; // timestamp
}

/**
 * Submittals table - Submittal records for deliverables
 */
export interface Submittal {
  id: string; // UUID
  deliverable_id: string; // UUID
  submittal_number: string; // VARCHAR(50)
  version: number;
  status: SubmittalStatus;
  purpose: SubmittalPurpose;
  discipline: Discipline;
  disciplines: Discipline[] | null; // Added in 02-approval-form-extensions.sql
  submitted_by: string; // UUID
  submitted_at: string | null; // TIMESTAMPTZ
  previous_submittal_id: string | null; // UUID
  previous_submittal_date: string | null; // DATE - added in 02-approval-form-extensions.sql
  consultant_signature_url: string | null; // added in 02-approval-form-extensions.sql
  submittal_stage: SubmittalStage; // added in 04-workflow-v2 — multi-stage review tracker
  request_type: RequestType; // added in 04-workflow-v2 — study | execution
  notes: string | null;
  notes_ar: string | null;
  file_url: string | null; // External file link — added in migration 009
  file_attachment_path: string | null; // Supabase Storage path — added in migration 009
  assigned_to_user_id: string | null; // UUID — assigned reviewer, added in migration 011
  created_at: string; // timestamp
  updated_at: string; // timestamp
  deleted_at: string | null; // timestamp
}

/**
 * Submittal Line Items - rows of the digital approval-form grid
 * Added in 02-approval-form-extensions.sql
 */
export interface SubmittalLineItem {
  id: string; // UUID
  submittal_id: string; // UUID
  item_no: number;
  output_name: string;
  output_name_ar: string | null;
  drawing_number: string | null;
  format: DeliverableFormat | null;
  revision_number: string | null;
  description: string | null;
  description_ar: string | null;
  action_code: ActionCode | null;
  created_at: string;
  updated_at: string;
}

/**
 * Request payload for creating a single line item
 */
export interface CreateLineItemRequest {
  item_no: number;
  output_name: string;
  output_name_ar?: string;
  drawing_number?: string;
  format?: DeliverableFormat;
  revision_number?: string;
  description?: string;
  description_ar?: string;
}

/**
 * Full digital-form payload — what the new
 * "Request for Approval of Deliverables" page sends to the backend
 */
export interface CreateApprovalFormRequest {
  deliverable_id: string;
  purpose: SubmittalPurpose;
  request_type?: RequestType; // added in 04-workflow-v2
  disciplines: Discipline[];
  notes?: string;
  notes_ar?: string;
  consultant_signature_url?: string;
  previous_submittal_id?: string;
  previous_submittal_date?: string;
  line_items: CreateLineItemRequest[];
  submit_for_review?: boolean; // if false → save as draft
}

/**
 * Documents table - Document files attached to submittals
 */
export interface Document {
  id: string; // UUID
  submittal_id: string; // UUID
  file_name: string; // VARCHAR(500)
  file_path: string;
  file_size_bytes: number; // BIGINT
  mime_type: string; // VARCHAR(100)
  format: DeliverableFormat;
  drawing_number: string | null; // VARCHAR(100)
  revision_number: string | null; // VARCHAR(20)
  description: string | null;
  uploaded_by: string; // UUID
  uploaded_at: string; // TIMESTAMPTZ
  deleted_at: string | null; // timestamp
}

/**
 * Reviews table - Reviewer comments and action codes
 */
export interface Review {
  id: string; // UUID
  submittal_id: string; // UUID
  reviewer_id: string; // UUID
  reviewer_role: UserRole;
  action_code: ActionCode;
  comments: string | null;
  comments_ar: string | null;
  review_step: number;
  reviewed_at: string; // TIMESTAMPTZ
  created_at: string; // timestamp
  updated_at: string; // timestamp
}

/**
 * Approvals table - Final approval records
 */
export interface Approval {
  id: string; // UUID
  submittal_id: string; // UUID
  approved_by: string; // UUID
  action_code: ActionCode;
  decision_date: string; // TIMESTAMPTZ
  comments: string | null;
  comments_ar: string | null;
  signature_url: string | null;
  created_at: string; // timestamp
}

/**
 * Audit logs table - Complete audit trail of system actions
 */
export interface AuditLog {
  id: string; // UUID
  entity_type: string; // VARCHAR(50)
  entity_id: string; // UUID
  action: AuditAction;
  performed_by: string; // UUID
  old_value: Record<string, unknown> | null; // JSONB
  new_value: Record<string, unknown> | null; // JSONB
  ip_address: string | null; // INET
  user_agent: string | null;
  created_at: string; // timestamp
}

/**
 * Notifications table - User notifications
 */
export interface Notification {
  id: string; // UUID
  user_id: string; // UUID
  title: string; // VARCHAR(500)
  message: string;
  entity_type: string; // VARCHAR(50)
  entity_id: string; // UUID
  is_read: boolean;
  created_at: string; // timestamp
}

// ============================================================================
// VIEW TYPES
// ============================================================================

/**
 * v_deliverable_summary view - Summary of deliverables with submittal status
 */
export interface DeliverableSummary {
  id: string; // deliverable UUID (aliased from deliverable_id in view)
  deliverable_id: string;
  code: string;
  name: string;
  name_ar: string;
  discipline: Discipline;
  format: DeliverableFormat;
  deliverable_status: DeliverableStatus;
  planned_date: string | null; // DATE
  actual_date: string | null; // DATE
  phase_number: number;
  phase_name: string;
  phase_name_ar: string;
  project_code: string;
  project_name: string;
  total_submittals: number;
  submittals_count: number; // alias for total_submittals
  latest_version: number | null;
  latest_submittal_status: SubmittalStatus | null;
}

/**
 * v_submittal_timeline view - Submittal history with workflow status
 */
export interface SubmittalTimeline {
  submittal_id: string;
  submittal_number: string;
  version: number;
  status: SubmittalStatus;
  submitted_at: string; // TIMESTAMPTZ
  deliverable_code: string;
  deliverable_name: string;
  submitted_by_name: string;
  latest_action_code: ActionCode | null;
  final_action_code: ActionCode | null;
  days_in_pipeline: number;
}

// ============================================================================
// RESPONSE TYPES (from stored procedures)
// ============================================================================

/**
 * KPI response from get_project_kpis function
 */
export interface ProjectKPI {
  total_deliverables: number;
  approved_count: number;
  rejected_count: number;
  pending_review_count: number;
  in_revision_count: number;
  avg_approval_days: number | null;
  rejection_rate_pct: number;
}

/**
 * Phase progress from get_phase_progress function
 */
export interface PhaseProgress {
  phase_number: number;
  phase_name: string;
  phase_name_ar: string;
  duration_weeks: number;
  phase_status: PhaseStatus;
  total_deliverables: number;
  approved_count: number;
  in_progress_count: number;
  delayed_count: number;
  not_started_count: number;
  completion_pct: number;
}

/**
 * Delayed deliverable from get_delayed_deliverables function
 */
export interface DelayedDeliverable {
  deliverable_code: string;
  deliverable_name: string;
  deliverable_name_ar: string;
  phase_number: number;
  phase_name: string;
  planned_date: string; // DATE
  days_delayed: number;
  current_status: DeliverableStatus;
  latest_submittal_status: SubmittalStatus | null;
}

/**
 * Consultant performance from get_consultant_performance function
 */
export interface ConsultantPerformance {
  consultant_id: string;
  consultant_name: string;
  organization: string;
  total_submittals: number;
  approved_first_time: number;
  total_approved: number;
  total_rejected: number;
  avg_revisions_to_approval: number;
  avg_days_to_approval: number | null;
  first_time_approval_rate: number;
}

/**
 * Action code distribution from get_action_code_distribution function
 */
export interface ActionCodeDistribution {
  code: ActionCode;
  label: string;
  total_count: number;
  pct: number;
}

// ============================================================================
// WORKFLOW & REQUEST TYPES
// ============================================================================

/**
 * Workflow transition trigger names (from workflow_transitions table)
 */
export type WorkflowTrigger =
  | 'consultant_submit' // draft → submitted
  | 'coordinator_pickup' // submitted → under_review OR resubmitted → under_review
  | 'reviewer_return' // under_review → revision_required (requires action_code C)
  | 'reviewer_reject' // under_review → rejected (requires action_code D)
  | 'owner_approve' // under_review → approved (requires action_code A or B)
  | 'owner_reject' // under_review → rejected (requires action_code D)
  | 'consultant_resubmit'; // revision_required → resubmitted

/**
 * Request to perform a workflow transition
 */
export interface WorkflowTransitionRequest {
  submittal_id: string;
  trigger: WorkflowTrigger;
  action_code?: ActionCode; // Required for some transitions
  comments?: string;
  comments_ar?: string;
}

/**
 * Response from a workflow transition
 */
export interface WorkflowTransitionResult {
  success: boolean;
  previous_status: SubmittalStatus;
  new_status: SubmittalStatus;
  message: string;
  timestamp: string;
}

// ============================================================================
// API REQUEST TYPES
// ============================================================================

export interface CreateProjectRequest {
  code: string;
  name: string;
  name_ar: string;
  description?: string;
  description_ar?: string;
  duration_months: number;
  start_date: string; // DATE
  end_date: string; // DATE
  project_manager_id: string;
  coordinator_id: string;
}

export interface UpdateProjectRequest {
  name?: string;
  name_ar?: string;
  description?: string;
  description_ar?: string;
  status?: ProjectStatus;
  duration_months?: number;
  start_date?: string;
  end_date?: string;
  project_manager_id?: string;
  coordinator_id?: string;
}

export interface CreatePhaseRequest {
  project_id: string;
  phase_number: number;
  name: string;
  name_ar: string;
  description?: string;
  description_ar?: string;
  duration_weeks: number;
  planned_start: string; // DATE
  planned_end: string; // DATE
  sort_order: number;
}

export interface UpdatePhaseRequest {
  name?: string;
  name_ar?: string;
  description?: string;
  description_ar?: string;
  duration_weeks?: number;
  status?: PhaseStatus;
  planned_start?: string;
  planned_end?: string;
  actual_start?: string;
  actual_end?: string;
  sort_order?: number;
}

export interface CreateDeliverableRequest {
  phase_id: string;
  code: string;
  name: string;
  name_ar: string;
  description?: string;
  description_ar?: string;
  discipline: Discipline;
  format: DeliverableFormat;
  planned_date: string; // DATE
  sort_order: number;
}

export interface UpdateDeliverableRequest {
  code?: string;
  name?: string;
  name_ar?: string;
  description?: string;
  description_ar?: string;
  discipline?: Discipline;
  format?: DeliverableFormat;
  planned_date?: string;
  actual_date?: string;
  status?: DeliverableStatus;
  sort_order?: number;
}

export interface CreateSubmittalRequest {
  deliverable_id: string;
  submittal_number: string;
  version: number;
  purpose: SubmittalPurpose;
  discipline: Discipline;
  notes?: string;
  notes_ar?: string;
  documents: Array<{
    file_name: string;
    file_path: string;
    file_size_bytes: number;
    mime_type: string;
    format: DeliverableFormat;
    drawing_number?: string;
    revision_number?: string;
    description?: string;
  }>;
}

export interface UpdateSubmittalRequest {
  status?: SubmittalStatus;
  purpose?: SubmittalPurpose;
  notes?: string;
  notes_ar?: string;
}

export interface SubmitSubmittalRequest {
  submittal_id: string;
}

export interface CreateReviewRequest {
  submittal_id: string;
  reviewer_id: string;
  reviewer_role: UserRole;
  action_code: ActionCode;
  comments?: string;
  comments_ar?: string;
  review_step: number;
}

export interface CreateApprovalRequest {
  submittal_id: string;
  approved_by: string;
  action_code: ActionCode;
  comments?: string;
  comments_ar?: string;
  signature_url?: string;
}

export interface CreateDocumentRequest {
  submittal_id: string;
  file_name: string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  format: DeliverableFormat;
  drawing_number?: string;
  revision_number?: string;
  description?: string;
}

export interface AddProjectMemberRequest {
  project_id: string;
  user_id: string;
  role: UserRole;
}

export interface CreateUserRequest {
  email: string;
  full_name: string;
  full_name_ar: string;
  role: UserRole;
  organization: string;
  phone: string;
}

export interface UpdateUserRequest {
  full_name?: string;
  full_name_ar?: string;
  role?: UserRole;
  organization?: string;
  phone?: string;
  avatar_url?: string;
  is_active?: boolean;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Generic response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  timestamp: string;
}

/**
 * Type for audit trail entries
 */
export interface AuditTrailEntry {
  audit_log: AuditLog;
  performed_by_user: User;
  entity_details: Record<string, unknown>;
}
