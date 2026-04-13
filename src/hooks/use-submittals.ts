'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type {
  Submittal,
  Document,
  Review,
  Approval,
  Deliverable,
  SubmittalLineItem,
  SubmittalTimeline,
  ActionCode,
  WorkflowTrigger,
} from '@/types/database';

/**
 * Filter options for submittals query
 */
export interface SubmittalFilters {
  deliverableCode?: string;
  status?: string;
  submittedByName?: string;
}

/**
 * Request payload for creating a submittal
 */
export interface CreateSubmittalPayload {
  deliverable_id: string;
  // 'for_information' is the v2 value; 'for_tendering' kept only for legacy
  // rows that may still be migrated from the old workflow.
  purpose: 'for_approval' | 'for_follow_up' | 'for_information' | 'for_tendering';
  notes?: string;
}

/**
 * Response from create-submittal edge function
 */
export interface CreateSubmittalResponse {
  id: string;
  deliverable_id: string;
  submittal_number: string;
  version: number;
  status: string;
  created_at: string;
}

/**
 * Request payload for workflow transition
 */
export interface WorkflowTransitionPayload {
  submittal_id: string;
  trigger_name: WorkflowTrigger;
  action_code?: ActionCode;
  comments?: string;
}

/**
 * Response from workflow-transition edge function
 */
export interface WorkflowTransitionResponse {
  success: boolean;
  old_status: string;
  new_status: string;
  trigger: string;
  submittal_id: string;
  new_stage?: string | null;
  assigned_to?: string | null;
  assigned_role?: string | null;
}

/**
 * Hook to fetch submittals from v_submittal_timeline view.
 * Supports filtering by deliverable code, status, and submitted by name.
 * @param filters - Optional filter criteria
 * @returns Query result with array of SubmittalTimeline data
 */
export function useSubmittals(filters?: SubmittalFilters) {
  const supabase = useSupabase();

  return useQuery<SubmittalTimeline[], Error>({
    queryKey: ['submittals', filters],
    queryFn: async () => {
      let query = supabase.from('v_submittal_timeline').select('*');

      if (filters?.deliverableCode) {
        query = query.eq('deliverable_code', filters.deliverableCode);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.submittedByName) {
        query = query.eq('submitted_by_name', filters.submittedByName);
      }

      const { data, error } = await query.order('submitted_at', {
        ascending: false,
      });

      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Hook to fetch a single submittal with related documents, reviews, and approvals.
 * @param id - The submittal UUID (optional, query is disabled if not provided)
 * @returns Query result with Submittal and related data
 */
/**
 * Extended submittal detail — includes all related data needed by
 * downstream review/approval pages to render the full submission package.
 */
export interface SubmittalDetail extends Submittal {
  documents: Document[];
  reviews: Review[];
  approval: Approval | null;
  deliverable: Deliverable | null;
  line_items: SubmittalLineItem[];
  project_name: string | null;
  project_name_ar: string | null;
  project_code: string | null;
  submitter_name: string | null;
  assigned_user_name: string | null;
  /** Map of user_id → display name for reviewers and approvers */
  user_names: Record<string, string>;
}

export function useSubmittal(id?: string) {
  const supabase = useSupabase();

  return useQuery<SubmittalDetail | null, Error>({
    queryKey: ['submittal', id],
    queryFn: async () => {
      if (!id) return null;

      const { data: submittal, error: submittalError } = await supabase
        .from('submittals')
        .select('*')
        .eq('id', id)
        .single();

      if (submittalError) throw submittalError;

      // Parallel fetch: documents, reviews, approval, line items, deliverable
      const [
        { data: documents, error: documentsError },
        { data: reviews, error: reviewsError },
        { data: approval, error: approvalError },
        { data: lineItems, error: lineItemsError },
        { data: deliverable, error: deliverableError },
      ] = await Promise.all([
        supabase
          .from('documents')
          .select('*')
          .eq('submittal_id', id),
        supabase
          .from('reviews')
          .select('*')
          .eq('submittal_id', id)
          .order('review_step', { ascending: true }),
        supabase
          .from('approvals')
          .select('*')
          .eq('submittal_id', id)
          .maybeSingle(),
        supabase
          .from('submittal_line_items')
          .select('*')
          .eq('submittal_id', id)
          .order('item_no', { ascending: true }),
        supabase
          .from('deliverables')
          .select('*')
          .eq('id', submittal.deliverable_id)
          .single(),
      ]);

      if (documentsError) throw documentsError;
      if (reviewsError) throw reviewsError;
      if (approvalError) throw approvalError;
      // Line items and deliverable are non-critical — don't throw if missing
      if (lineItemsError) console.warn('[EDGS:hook] line_items fetch error:', lineItemsError.message);
      if (deliverableError) console.warn('[EDGS:hook] deliverable fetch error:', deliverableError.message);

      // Resolve project name via deliverable → phase → project chain
      let projectName: string | null = null;
      let projectNameAr: string | null = null;
      let projectCode: string | null = null;
      if (deliverable?.phase_id) {
        try {
          const { data: phase } = await supabase
            .from('phases')
            .select('project_id')
            .eq('id', deliverable.phase_id)
            .single();
          if (phase?.project_id) {
            const { data: project } = await supabase
              .from('projects')
              .select('code, name, name_ar')
              .eq('id', phase.project_id)
              .single();
            if (project) {
              projectName = project.name || null;
              projectNameAr = project.name_ar || null;
              projectCode = project.code || null;
            }
          }
        } catch { /* non-critical */ }
      }

      // Resolve submitter name
      let submitterName: string | null = null;
      if (submittal.submitted_by) {
        try {
          const { data: submitter } = await supabase
            .from('users')
            .select('full_name, full_name_ar, email')
            .eq('id', submittal.submitted_by)
            .single();
          if (submitter) {
            submitterName = submitter.full_name || submitter.full_name_ar || submitter.email || null;
          }
        } catch { /* non-critical */ }
      }

      // Resolve assigned user name
      let assignedUserName: string | null = null;
      if (submittal.assigned_to_user_id) {
        try {
          const { data: assignee } = await supabase
            .from('users')
            .select('full_name, full_name_ar, email')
            .eq('id', submittal.assigned_to_user_id)
            .single();
          if (assignee) {
            assignedUserName = assignee.full_name || assignee.full_name_ar || assignee.email || null;
          }
        } catch { /* non-critical */ }
      }

      // Resolve all user UUIDs referenced in reviews + approval to display names
      const userNames: Record<string, string> = {};
      const allUserIds = new Set<string>();
      if (submittal.submitted_by) allUserIds.add(submittal.submitted_by);
      if (submittal.assigned_to_user_id) allUserIds.add(submittal.assigned_to_user_id);
      for (const r of (reviews || [])) {
        if (r.reviewer_id) allUserIds.add(r.reviewer_id);
      }
      if (approval?.approved_by) allUserIds.add(approval.approved_by);

      if (allUserIds.size > 0) {
        try {
          const { data: users } = await supabase
            .from('users')
            .select('id, full_name, full_name_ar, email')
            .in('id', Array.from(allUserIds));
          if (users) {
            for (const u of users) {
              userNames[u.id] = u.full_name || u.full_name_ar || u.email || u.id;
            }
          }
        } catch { /* non-critical */ }
      }

      // Fill in submitter/assigned names from the batch lookup
      if (!submitterName && submittal.submitted_by && userNames[submittal.submitted_by]) {
        submitterName = userNames[submittal.submitted_by];
      }
      if (!assignedUserName && submittal.assigned_to_user_id && userNames[submittal.assigned_to_user_id]) {
        assignedUserName = userNames[submittal.assigned_to_user_id];
      }

      return {
        ...submittal,
        documents: documents || [],
        reviews: reviews || [],
        approval,
        deliverable: (deliverable as Deliverable) || null,
        line_items: (lineItems as SubmittalLineItem[]) || [],
        project_name: projectName,
        project_name_ar: projectNameAr,
        project_code: projectCode,
        submitter_name: submitterName,
        assigned_user_name: assignedUserName,
        user_names: userNames,
      };
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new submittal via edge function.
 * Calls the "create-submittal" edge function with deliverable_id, purpose, and optional notes.
 * @returns Mutation hook for creating submittals
 */
export function useCreateSubmittal() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  return useMutation<CreateSubmittalResponse, Error, CreateSubmittalPayload>({
    mutationFn: async (payload) => {
      /* ── DEBUG ── */ console.log('[EDGS:hook] useCreateSubmittal called with:', JSON.stringify(payload));

      // Wrap supabase.functions.invoke with a 30-second timeout to prevent
      // indefinite hangs when the edge function or network stalls.
      let data: CreateSubmittalResponse | null = null;
      let error: { message: string; context?: Response } | null = null;

      try {
        const result = await Promise.race([
          supabase.functions.invoke('create-submittal', {
            body: {
              deliverable_id: payload.deliverable_id,
              purpose: payload.purpose,
              notes: payload.notes,
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out after 30 seconds. Please try again.')), 30000)
          ),
        ]);
        data = result.data;
        error = result.error as typeof error;
      } catch (timeoutErr) {
        /* ── DEBUG ── */ console.error('[EDGS:hook] create-submittal timeout or network error:', timeoutErr);
        throw timeoutErr instanceof Error ? timeoutErr : new Error(String(timeoutErr));
      }

      /* ── DEBUG ── */ console.log('[EDGS:hook] create-submittal raw response — data:', data ? 'present' : 'null', '| error:', error?.message || 'null');

      if (error) {
        // Supabase wraps non-2xx edge-function responses in FunctionsHttpError
        // whose generic message is "Edge Function returned a non-2xx status
        // code". The real error body lives on `error.context`, which is the
        // Response object. Surface the real message to the caller so the
        // UI can render something useful instead of a generic wrapper.
        let detail = error.message;
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx && typeof ctx === 'object' && 'json' in ctx) {
          try {
            const body = await ctx.clone().json();
            /* ── DEBUG ── */ console.log('[EDGS:hook] create-submittal error body:', JSON.stringify(body));
            if (body?.error) detail = String(body.error);
            else if (body?.message) detail = String(body.message);
          } catch {
            try {
              const txt = await ctx.clone().text();
              if (txt) detail = txt;
            } catch {
              /* ignore */
            }
          }
        }
        /* ── DEBUG ── */ console.error('[EDGS:hook] create-submittal throwing:', detail);
        throw new Error(detail);
      }

      // Backend returned 2xx but body may still contain a structured error
      // (older versions of the function responded with { error } + 200).
      if (data && typeof data === 'object' && 'error' in data && (data as { error: unknown }).error) {
        throw new Error(String((data as { error: unknown }).error));
      }
      /* ── DEBUG ── */ console.log('[EDGS:hook] create-submittal succeeded, id:', (data as CreateSubmittalResponse)?.id);
      return data as CreateSubmittalResponse;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['submittals'],
      });
      queryClient.invalidateQueries({
        queryKey: ['deliverable', variables.deliverable_id],
      });
    },
  });
}

/**
 * Hook to perform a workflow transition via edge function.
 * Calls the "workflow-transition" edge function with submittal_id, trigger_name, and optional action_code/comments.
 * @returns Mutation hook for workflow transitions
 */
/**
 * Request payload for recording a review comment (action codes A/B).
 * This is NOT a workflow transition — it records the reviewer's decision
 * without changing the submittal status.
 */
export interface RecordReviewCommentPayload {
  submittal_id: string;
  user_id: string;
  action_code: ActionCode;
  comments?: string | null;
}

/**
 * Hook to record a review comment via the record_review_comment RPC.
 * Used for action codes A (No Comments) and B (Make Corrections) which
 * do not trigger a workflow transition — they simply log the reviewer's
 * decision against the submittal.
 * @returns Mutation hook for recording review comments
 */
export function useRecordReviewComment() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, RecordReviewCommentPayload>({
    mutationFn: async (payload) => {
      console.log('[EDGS:hook] useRecordReviewComment called with:', JSON.stringify(payload));

      const { data, error } = await supabase.rpc('record_review_comment', {
        p_submittal_id: payload.submittal_id,
        p_user_id: payload.user_id,
        p_action_code: payload.action_code,
        p_comments: payload.comments ?? null,
      });

      console.log('[EDGS:hook] record_review_comment response — data:', JSON.stringify(data), '| error:', error ? JSON.stringify({ message: error.message }) : 'null');

      if (error) {
        console.error('[EDGS:hook] RPC error:', error.message);
        throw new Error(error.message);
      }

      // RPC may return null (no rows affected) or { success: false }
      if (data === null || data === undefined) {
        console.error('[EDGS:hook] RPC returned null — comment may not have been recorded');
        throw new Error('Review comment was not recorded. Please check your role and the submittal status.');
      }

      if (data && typeof data === 'object' && 'success' in data && !(data as { success: boolean }).success) {
        const errMsg = (data as { error?: string }).error || 'Failed to record review comment';
        console.error('[EDGS:hook] RPC success=false:', errMsg);
        throw new Error(errMsg);
      }

      console.log('[EDGS:hook] Review comment recorded successfully:', JSON.stringify(data));
      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['submittal', variables.submittal_id] });
      queryClient.invalidateQueries({ queryKey: ['submittals'] });
      queryClient.invalidateQueries({ queryKey: ['deliverables'] });
      queryClient.invalidateQueries({ queryKey: ['deliverable'] });
    },
  });
}

/**
 * Hook to perform a workflow transition via edge function.
 * Calls the "workflow-transition" edge function with submittal_id, trigger_name, and optional action_code/comments.
 * @returns Mutation hook for workflow transitions
 */
export function useWorkflowTransition() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  return useMutation<WorkflowTransitionResponse, Error, WorkflowTransitionPayload>(
    {
      mutationFn: async (payload) => {
        /* ── DEBUG ── */ console.log('[EDGS:hook] useWorkflowTransition called with:', JSON.stringify(payload));

        // Wrap with 30-second timeout to prevent indefinite hangs
        let data: WorkflowTransitionResponse | null = null;
        let error: { message: string; context?: Response } | null = null;
        try {
          const result = await Promise.race([
            supabase.functions.invoke('workflow-transition', {
              body: {
                submittal_id: payload.submittal_id,
                trigger_name: payload.trigger_name,
                action_code: payload.action_code,
                comments: payload.comments,
              },
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Workflow transition timed out after 30 seconds. Please try again.')), 30000)
            ),
          ]);
          data = result.data;
          error = result.error as typeof error;
        } catch (timeoutErr) {
          /* ── DEBUG ── */ console.error('[EDGS:hook] workflow-transition timeout or network error:', timeoutErr);
          throw timeoutErr instanceof Error ? timeoutErr : new Error(String(timeoutErr));
        }

        /* ── DEBUG ── */ console.log('[EDGS:hook] Edge function raw response — data:', JSON.stringify(data), '| error:', error ? JSON.stringify({ message: error.message, name: error.name }) : 'null');

        if (error) {
          // Supabase wraps non-2xx edge-function responses in FunctionsHttpError.
          // The real error body lives on error.context (a Response object).
          // Extract the actual message so callers get something useful.
          let detail = error.message;
          const ctx = (error as unknown as { context?: Response }).context;
          /* ── DEBUG ── */ console.log('[EDGS:hook] Error has context?', !!ctx);
          if (ctx && typeof ctx === 'object' && 'json' in ctx) {
            try {
              const body = await ctx.clone().json();
              /* ── DEBUG ── */ console.log('[EDGS:hook] Error context body:', JSON.stringify(body));
              if (body?.error) detail = String(body.error);
              else if (body?.message) detail = String(body.message);
            } catch {
              try {
                const txt = await ctx.clone().text();
                /* ── DEBUG ── */ console.log('[EDGS:hook] Error context text:', txt);
                if (txt) detail = txt;
              } catch {
                /* ignore */
              }
            }
          }
          /* ── DEBUG ── */ console.error('[EDGS:hook] Throwing error:', detail);
          throw new Error(detail);
        }

        // Backend returned 2xx but body may still indicate failure
        // (the edge function returns { success: false, error: "..." } with 422,
        // but defensive check here in case it ever returns 200 with success=false).
        if (data && typeof data === 'object' && 'success' in data && !(data as { success: boolean }).success) {
          const errMsg = (data as { error?: string }).error || 'Workflow transition failed';
          /* ── DEBUG ── */ console.error('[EDGS:hook] Success=false, throwing:', errMsg);
          throw new Error(errMsg);
        }

        /* ── DEBUG ── */ console.log('[EDGS:hook] Transition succeeded:', JSON.stringify(data));
        return data as WorkflowTransitionResponse;
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({
          queryKey: ['submittal', variables.submittal_id],
        });
        queryClient.invalidateQueries({
          queryKey: ['submittals'],
        });
        queryClient.invalidateQueries({
          queryKey: ['deliverables'],
        });
        // Also invalidate the specific deliverable detail (which includes submittals)
        queryClient.invalidateQueries({
          queryKey: ['deliverable'],
        });
      },
    }
  );
}
