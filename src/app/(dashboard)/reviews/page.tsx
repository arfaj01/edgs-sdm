'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, ArrowRight, Clock, AlertTriangle, Inbox } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { useI18n } from '@/lib/i18n';
import { useSupabase } from '@/hooks/use-supabase';
import { useUser } from '@/hooks/use-user';
import { cn, formatDate } from '@/lib/utils';
import {
  computeWorkflowState,
  formatTimeRemaining,
  userCanActOnRole,
} from '@/lib/workflow-sla';
import type {
  SubmittalStatus,
  SubmittalStage,
} from '@/types/database';

interface QueueRow {
  id: string;
  submittal_number: string;
  status: SubmittalStatus;
  submittal_stage: SubmittalStage;
  submitted_at: string | null;
  updated_at: string;
  deliverable: {
    id: string;
    code: string;
    name: string;
    name_ar: string | null;
  } | null;
}

/**
 * /reviews — list page for Technical Unit and Quality Unit reviewers.
 * Pulls every submittal whose assigned role matches the viewer's canonical
 * role and routes each row to its detail page. This fixes the 404 that
 * existed because the sidebar linked to /reviews without a page.tsx.
 */
export default function ReviewsListPage() {
  const { t, isRTL } = useI18n();
  const supabase = useSupabase();
  const { user, isLoading: userLoading } = useUser();

  const userRole = user?.role;

  const { data: rows, isLoading, error } = useQuery<QueueRow[], Error>({
    queryKey: ['reviews-queue'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('submittals')
        .select(
          `id, submittal_number, status, submittal_stage, submitted_at, updated_at,
           deliverable:deliverables!inner(id, code, name, name_ar)`,
        )
        .in('status', ['submitted', 'under_review', 'resubmitted'])
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      if (err) throw err;
      // Supabase can return nested joins as either object or array — normalize.
      return (data || []).map((row: Record<string, unknown>) => ({
        ...(row as unknown as QueueRow),
        deliverable: Array.isArray(row.deliverable)
          ? (row.deliverable[0] as QueueRow['deliverable'])
          : (row.deliverable as QueueRow['deliverable']),
      })) as QueueRow[];
    },
    enabled: !!userRole,
  });

  // Filter client-side by assigned_role matching the viewer's role.
  const visible = useMemo(() => {
    if (!rows) return [];
    return rows.filter((row) => {
      const state = computeWorkflowState(row);
      return userCanActOnRole(userRole, state.assignedRole);
    });
  }, [rows, userRole]);

  const overdueCount = useMemo(
    () => visible.filter((r) => computeWorkflowState(r).overdue).length,
    [visible],
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title={t('reviewsQueue.title')}
          description={t('reviewsQueue.description')}
        />

        {/* Summary strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
            <ClipboardCheck className="w-5 h-5" style={{ color: '#045859' }} />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                {t('reviewsQueue.pendingCount')}
              </p>
              <p className="text-2xl font-bold text-gray-900">{visible.length}</p>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600" />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                {t('reviewsQueue.approachingCount')}
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {visible.filter((r) => computeWorkflowState(r).approaching).length}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                {t('reviewsQueue.overdueCount')}
              </p>
              <p className="text-2xl font-bold text-red-700">{overdueCount}</p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {(isLoading || userLoading) && (
            <div className="p-12 text-center text-gray-500">{t('common.loading')}</div>
          )}

          {error && (
            <div className="p-6 text-center text-red-600 bg-red-50 border-b border-red-200">
              {t('common.error')}: {error.message}
            </div>
          )}

          {!isLoading && !error && visible.length === 0 && (
            <div className="p-12 text-center">
              <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">{t('reviewsQueue.emptyTitle')}</p>
              <p className="text-sm text-gray-400 mt-1">{t('reviewsQueue.emptyDesc')}</p>
            </div>
          )}

          {!isLoading && !error && visible.length > 0 && (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-start">
                    {t('reviewsQueue.colNumber')}
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-start">
                    {t('reviewsQueue.colDeliverable')}
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-start">
                    {t('reviewsQueue.colStatus')}
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-start">
                    {t('reviewsQueue.colStage')}
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-start">
                    {t('reviewsQueue.colDue')}
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-end">
                    {t('reviewsQueue.colAction')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((row) => {
                  const state = computeWorkflowState(row);
                  const remaining = formatTimeRemaining(state.hoursRemaining);
                  const stageLabelKey = state.activeStage
                    ? `workflow.stage${state.activeStage.charAt(0).toUpperCase()}${state.activeStage.slice(1)}`
                    : '';
                  const deliverableName = isRTL
                    ? row.deliverable?.name_ar || row.deliverable?.name
                    : row.deliverable?.name;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'hover:bg-[#e6f2f2]/40 transition-colors',
                        state.overdue && 'bg-red-50/60',
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-sm text-gray-900">
                        {row.submittal_number}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900">
                          {row.deliverable?.code}
                        </div>
                        <div className="text-xs text-gray-500 truncate max-w-xs">
                          {deliverableName}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {stageLabelKey ? t(stageLabelKey) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {remaining ? (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                              remaining.overdue
                                ? 'bg-red-100 text-red-700'
                                : state.approaching
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-gray-100 text-gray-700',
                            )}
                          >
                            {remaining.overdue ? (
                              <AlertTriangle className="w-3 h-3" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                            {remaining.overdue
                              ? t(`reviewsQueue.overdueBy${remaining.unit === 'day' ? 'Day' : 'Hour'}`, {
                                  n: remaining.magnitude,
                                })
                              : t(`reviewsQueue.dueIn${remaining.unit === 'day' ? 'Day' : 'Hour'}`, {
                                  n: remaining.magnitude,
                                })}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                        {state.stageStartedAt && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {t('reviewsQueue.stageStarted')}: {formatDate(state.stageStartedAt)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <Link
                          href={`/reviews/${row.id}`}
                          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white transition"
                          style={{ backgroundColor: '#045859' }}
                        >
                          {t('reviewsQueue.review')}
                          <ArrowRight className={cn('w-3 h-3', isRTL && 'rotate-180')} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
