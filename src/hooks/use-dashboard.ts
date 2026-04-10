'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  ProjectKPI,
  PhaseProgress,
  DelayedDeliverable,
  ConsultantPerformance,
  ActionCodeDistribution,
} from '@/types/database';

/**
 * Complete dashboard KPI response structure
 */
export interface DashboardKPIs {
  summary: ProjectKPI;
  phase_progress: PhaseProgress[];
  delayed_deliverables: DelayedDeliverable[];
  consultant_performance: ConsultantPerformance[];
  action_code_distribution: ActionCodeDistribution[];
}

/**
 * Hook to fetch dashboard KPIs via the dashboard-kpis edge function.
 * Passes project_id as URL query parameter.
 * @param projectId - Optional project UUID to filter KPIs
 * @returns Query result with DashboardKPIs data
 */
export function useDashboardKPIs(projectId?: string) {
  return useQuery<DashboardKPIs, Error>({
    queryKey: ['dashboard-kpis', projectId],
    queryFn: async () => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase environment variables');
      }

      const url = new URL(
        `${supabaseUrl}/functions/v1/dashboard-kpis`
      );
      if (projectId) {
        url.searchParams.append('project_id', projectId);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch dashboard KPIs: ${response.statusText}`
        );
      }

      const data = await response.json();
      return data as DashboardKPIs;
    },
  });
}
