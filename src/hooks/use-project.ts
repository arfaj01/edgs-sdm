'use client';

import { useQuery } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type { Project } from '@/types/database';

/**
 * Hook to fetch a single project by ID.
 * @param projectId - The project UUID (optional, query is disabled if not provided)
 * @returns Query result with Project data or null
 */
export function useProject(projectId?: string) {
  const supabase = useSupabase();

  return useQuery<Project | null, Error>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId) return null;

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

/**
 * Hook to fetch all projects.
 * @returns Query result with array of Project data
 */
export function useProjects() {
  const supabase = useSupabase();

  return useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
}
