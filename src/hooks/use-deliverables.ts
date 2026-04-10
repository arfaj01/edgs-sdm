'use client';

import { useQuery } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type { DeliverableSummary, Deliverable, Submittal, Document } from '@/types/database';

/**
 * Filter options for deliverables query
 */
export interface DeliverableFilters {
  projectCode?: string;
  phaseNumber?: number;
  deliverableStatus?: string;
  discipline?: string;
  search?: string;
}

/**
 * Hook to fetch deliverables from v_deliverable_summary view.
 * Supports filtering by project code, phase, status, discipline, and search on code column.
 * @param filters - Optional filter criteria
 * @returns Query result with array of DeliverableSummary data
 */
export function useDeliverables(filters?: DeliverableFilters) {
  const supabase = useSupabase();

  return useQuery<DeliverableSummary[], Error>({
    queryKey: ['deliverables', filters],
    queryFn: async () => {
      let query = supabase.from('v_deliverable_summary').select('*');

      if (filters?.projectCode) {
        query = query.eq('project_code', filters.projectCode);
      }

      if (filters?.phaseNumber !== undefined) {
        query = query.eq('phase_number', filters.phaseNumber);
      }

      if (filters?.deliverableStatus) {
        query = query.eq('deliverable_status', filters.deliverableStatus);
      }

      if (filters?.discipline) {
        query = query.eq('discipline', filters.discipline);
      }

      if (filters?.search) {
        query = query.ilike('code', `%${filters.search}%`);
      }

      const { data, error } = await query.order('phase_number', {
        ascending: true,
      });

      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Hook to fetch a single deliverable with its submittals.
 * Joins deliverables table with submittals.
 * @param id - The deliverable UUID (optional, query is disabled if not provided)
 * @returns Query result with Deliverable and related submittals data
 */
export function useDeliverable(id?: string) {
  const supabase = useSupabase();

  return useQuery<
    (Deliverable & { submittals: (Submittal & { documents: Document[] })[] }) | null,
    Error
  >({
    queryKey: ['deliverable', id],
    queryFn: async () => {
      if (!id) return null;

      const { data: deliverable, error: deliverableError } = await supabase
        .from('deliverables')
        .select('*')
        .eq('id', id)
        .single();

      if (deliverableError) throw deliverableError;

      const { data: submittals, error: submittalsError } = await supabase
        .from('submittals')
        .select('*, documents(*)')
        .eq('deliverable_id', id)
        .order('submitted_at', { ascending: false });

      if (submittalsError) throw submittalsError;

      return {
        ...deliverable,
        submittals: submittals || [],
      };
    },
    enabled: !!id,
  });
}
