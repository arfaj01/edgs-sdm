'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type {
  Submittal,
  Document,
  Review,
  Approval,
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
export function useSubmittal(id?: string) {
  const supabase = useSupabase();

  return useQuery<
    (Submittal & {
      documents: Document[];
      reviews: Review[];
      approval: Approval | null;
    }) | null,
    Error
  >({
    queryKey: ['submittal', id],
    queryFn: async () => {
      if (!id) return null;

      const { data: submittal, error: submittalError } = await supabase
        .from('submittals')
        .select('*')
        .eq('id', id)
        .single();

      if (submittalError) throw submittalError;

      const [
        { data: documents, error: documentsError },
        { data: reviews, error: reviewsError },
        { data: approval, error: approvalError },
      ] = await Promise.all([
        supabase
          .from('documents')
          .select('*')
          .eq('submittal_id', id),
        supabase
          .from('reviews')
          .select('*')
          .eq('submittal_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('approvals')
          .select('*')
          .eq('submittal_id', id)
          .maybeSingle(),
      ]);

      if (documentsError) throw documentsError;
      if (reviewsError) throw reviewsError;
      if (approvalError) throw approvalError;

      return {
        ...submittal,
        documents: documents || [],
        reviews: reviews || [],
        approval,
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
      const { data, error } = await supabase.functions.invoke(
        'create-submittal',
        {
          body: {
            deliverable_id: payload.deliverable_id,
            purpose: payload.purpose,
            notes: payload.notes,
          },
        }
      );

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
        throw new Error(detail);
      }

      // Backend returned 2xx but body may still contain a structured error
      // (older versions of the function responded with { error } + 200).
      if (data && typeof data === 'object' && 'error' in data && (data as { error: unknown }).error) {
        throw new Error(String((data as { error: unknown }).error));
      }
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

        const { data, error } = await supabase.functions.invoke(
          'workflow-transition',
          {
            body: {
              submittal_id: payload.submittal_id,
              trigger_name: payload.trigger_name,
              action_code: payload.action_code,
              comments: payload.comments,
            },
          }
        );

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
