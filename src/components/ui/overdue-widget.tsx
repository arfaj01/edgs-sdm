'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useSupabase } from '@/hooks/use-supabase';
import { cn } from '@/lib/utils';
import {
  computeWorkflowState,
  formatTimeRemaining,
  userCanActOnRole,
} from '@/lib/workflow-sla';
import type {
  SubmittalStatus,
  SubmittalStage,
  UserRole,
} from '@/types/database';

interface WidgetRow {
  id: string;
  submittal_number: string;
  status: SubmittalStatus;
  submittal_stage: SubmittalStage;
  submitted_at: string | null;
  updated_at: string;
}

interface OverdueWidgetProps {
  /** Current viewer's role — filters rows to those the viewer can act on. */
  userRole: UserRole | null | undefined;
  className?: string;
}

/**
 * Dashboard widget showing overdue + approaching-due submittals for the
 * current viewer. Automatically hides itself when there's nothing to show.
 *
 * Roles that see entries here:
 *   - technical_unit / quality_unit / project_manager → items they own
 *   - admin / department_director → all items (via userCanActOnRole)
 *   - submitter → items that were returned to them
 */
export function OverdueWidget({ userRole, className }: OverdueWidgetProps) {
  const { t, isRTL } = useI18n();
  const supabase = useSupabase();

  const { data: rows } = useQuery<WidgetRow[], Error>({
    queryKey: ['overdue-widget'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('submittals')
        .select('id, submittal_number, status, submittal_stage, submitted_at, updated_at')
        .in('status', ['submitted', 'under_review', 'resubmitted', 'revision_required'])
        .is('deleted_at', null)
        .order('updated_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []) as WidgetRow[];
    },
    enabled: !!userRole,
  });

  const { overdue, approaching } = useMemo(() => {
    const o: Array<WidgetRow & { hoursRemaining: number | null }> = [];
    const a: Array<WidgetRow & { hoursRemaining: number | null }> = [];
    (rows || []).forEach((row) => {
      const state = computeWorkflowState(row);
      if (!userCanActOnRole(userRole, state.assignedRole)) return;
      if (state.overdue) {
        o.push({ ...row, hoursRemaining: state.hoursRemaining });
      } else if (state.approaching) {
        a.push({ ...row, hoursRemaining: state.hoursRemaining });
      }
    });
    return { overdue: o, approaching: a };
  }, [rows, userRole]);

  // Hide widget entirely when there's nothing to show.
  if (overdue.length === 0 && approaching.length === 0) return null;

  const hrefFor = (row: WidgetRow) => {
    if (userRole === 'project_manager' || userRole === 'department_director' || userRole === 'owner') {
      return `/approvals/${row.id}`;
    }
    return `/reviews/${row.id}`;
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        overdue.length > 0
          ? 'bg-red-50/50 border-red-200'
          : 'bg-amber-50/50 border-amber-200',
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        {overdue.length > 0 ? (
          <AlertTriangle className="w-5 h-5 text-red-600" />
        ) : (
          <Clock className="w-5 h-5 text-amber-600" />
        )}
        <h3
          className={cn(
            'text-sm font-semibold',
            overdue.length > 0 ? 'text-red-900' : 'text-amber-900',
          )}
        >
          {overdue.length > 0
            ? t('overdueWidget.overdueTitle', { n: overdue.length })
            : t('overdueWidget.approachingTitle', { n: approaching.length })}
        </h3>
      </div>

      <ul className="space-y-2">
        {[...overdue, ...approaching].slice(0, 5).map((row) => {
          const remaining = formatTimeRemaining(row.hoursRemaining);
          const isOverdue = row.hoursRemaining != null && row.hoursRemaining < 0;
          return (
            <li key={row.id}>
              <Link
                href={hrefFor(row)}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition',
                  isOverdue
                    ? 'bg-white hover:bg-red-50 border border-red-100'
                    : 'bg-white hover:bg-amber-50 border border-amber-100',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs text-gray-700 shrink-0">
                    {row.submittal_number}
                  </span>
                  {remaining && (
                    <span
                      className={cn(
                        'text-xs font-medium',
                        isOverdue ? 'text-red-700' : 'text-amber-700',
                      )}
                    >
                      {isOverdue
                        ? t(
                            `reviewsQueue.overdueBy${remaining.unit === 'day' ? 'Day' : 'Hour'}`,
                            { n: remaining.magnitude },
                          )
                        : t(
                            `reviewsQueue.dueIn${remaining.unit === 'day' ? 'Day' : 'Hour'}`,
                            { n: remaining.magnitude },
                          )}
                    </span>
                  )}
                </div>
                <ArrowRight
                  className={cn(
                    'w-3.5 h-3.5 text-gray-400',
                    isRTL && 'rotate-180',
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>

      {(overdue.length + approaching.length) > 5 && (
        <div className="mt-3 text-end">
          <Link
            href="/reviews"
            className="text-xs font-medium"
            style={{ color: '#045859' }}
          >
            {t('overdueWidget.viewAll')} →
          </Link>
        </div>
      )}
    </div>
  );
}
