'use client';

import { useQuery } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type { AuditLog } from '@/types/database';

/**
 * Filter options for audit logs query
 */
export interface AuditFilters {
  entityType?: string;
  entityId?: string;
  performedBy?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  perPage?: number;
}

/**
 * Paginated audit logs response
 */
export interface PaginatedAuditLogs {
  data: AuditLog[];
  totalCount: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/**
 * Hook to fetch audit logs from the audit_logs table.
 * Supports filtering by entity type, entity ID, performed by user, and date range.
 * Includes pagination support.
 * @param filters - Optional filter and pagination criteria
 * @returns Query result with paginated AuditLog data
 */
export function useAuditLogs(filters?: AuditFilters) {
  const supabase = useSupabase();
  const page = filters?.page || 1;
  const perPage = filters?.perPage || 50;
  const offset = (page - 1) * perPage;

  return useQuery<PaginatedAuditLogs, Error>({
    queryKey: ['audit-logs', filters],
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' });

      if (filters?.entityType) {
        query = query.eq('entity_type', filters.entityType);
      }

      if (filters?.entityId) {
        query = query.eq('entity_id', filters.entityId);
      }

      if (filters?.performedBy) {
        query = query.eq('performed_by', filters.performedBy);
      }

      if (filters?.fromDate) {
        query = query.gte('created_at', filters.fromDate);
      }

      if (filters?.toDate) {
        query = query.lte('created_at', filters.toDate);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + perPage - 1);

      if (error) throw error;

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / perPage);

      return {
        data: data || [],
        totalCount,
        page,
        perPage,
        totalPages,
      };
    },
  });
}
