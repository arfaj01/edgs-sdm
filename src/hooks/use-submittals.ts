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
  purpose: 'for_approval' | 'for_follow_up' | 'for_tendering';
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

      if (error) throw error;
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
export function useWorkflowTransition() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  return useMutation<WorkflowTransitionResponse, Error, WorkflowTransitionPayload>(
    {
      mutationFn: async (payload) => {
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

        if (error) throw error;
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
      },
    }
  );
}
