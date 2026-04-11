'use client';

import React from 'react';
import { Clock, User as UserIcon, Layers, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { StatusBadge } from './status-badge';
import type { SubmittalStatus, SubmittalStage } from '@/types/database';
import {
  computeWorkflowState,
  formatTimeRemaining,
} from '@/lib/workflow-sla';

interface SmartHeaderProps {
  status: SubmittalStatus;
  stage: SubmittalStage;
  assignedTo?: string | null;
  submittalNumber?: string;
  /** Optional — required for real due_at / overdue display. */
  submittedAt?: string | null;
  /** Optional — anchor for stage SLA computation (fallback to submittedAt). */
  updatedAt?: string | null;
  className?: string;
}

/**
 * Status bar at the top of any submittal page. Shows:
 *   - Status badge (translated)
 *   - Current stage label (Technical/Quality/PM)
 *   - Assigned user (if available)
 *   - **Real** expected turnaround / due-in / overdue indicator driven by
 *     `workflow-sla` when `submittedAt` + `updatedAt` are provided.
 *     Falls back to the legacy placeholder when they are not.
 *
 * Designed as a non-intrusive info strip that appears above the existing page header.
 */
export function SmartHeader({
  status,
  stage,
  assignedTo,
  submittalNumber,
  submittedAt,
  updatedAt,
  className,
}: SmartHeaderProps) {
  const { t, isRTL } = useI18n();

  const stageLabelKey = (() => {
    if (status === 'approved') return 'workflow.stagePM';
    if (status === 'rejected') return null;
    if (stage === 'technical') return 'workflow.stageTechnical';
    if (stage === 'quality') return 'workflow.stageQuality';
    if (stage === 'pm') return 'workflow.stagePM';
    return null;
  })();

  // Compute real workflow state when we have the columns we need.
  const workflowState = (submittedAt !== undefined || updatedAt !== undefined)
    ? computeWorkflowState({
        status,
        submittal_stage: stage,
        submitted_at: submittedAt ?? null,
        updated_at: updatedAt ?? submittedAt ?? new Date().toISOString(),
      })
    : null;

  const remaining = workflowState ? formatTimeRemaining(workflowState.hoursRemaining) : null;

  const durationLabel = (() => {
    if (!remaining) return t('ux.expectedDurationPlaceholder');
    if (remaining.overdue) {
      return t(
        `reviewsQueue.overdueBy${remaining.unit === 'day' ? 'Day' : 'Hour'}`,
        { n: remaining.magnitude },
      );
    }
    return t(
      `reviewsQueue.dueIn${remaining.unit === 'day' ? 'Day' : 'Hour'}`,
      { n: remaining.magnitude },
    );
  })();

  return (
    <div
      className={cn(
        'rounded-lg border shadow-sm mb-6',
        workflowState?.overdue
          ? 'bg-gradient-to-r from-red-50 to-white border-red-300'
          : 'bg-gradient-to-r from-[#e6f2f2] to-white border-[#045859]/20',
        className
      )}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Title */}
        <div className="flex items-center gap-2 min-w-[160px]">
          <div
            className={cn(
              'w-1 h-8 rounded-full',
              workflowState?.overdue ? 'bg-red-600' : 'bg-[#045859]',
            )}
          />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
              {t('ux.smartHeaderTitle')}
            </p>
            {submittalNumber && (
              <p
                className={cn(
                  'text-sm font-bold',
                  workflowState?.overdue ? 'text-red-700' : 'text-[#045859]',
                )}
              >
                {submittalNumber}
              </p>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            {t('ux.statusLabel')}
          </span>
          <div className="mt-1">
            <StatusBadge status={status} size="sm" />
          </div>
        </div>

        {/* Stage */}
        {stageLabelKey && (
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
              {t('ux.stageLabel')}
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#045859]" />
              <span className="text-sm font-semibold text-gray-900">{t(stageLabelKey)}</span>
            </div>
          </div>
        )}

        {/* Assigned */}
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            {t('ux.assignedTo')}
          </span>
          <div className="mt-1 flex items-center gap-1.5">
            <UserIcon className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-sm font-medium text-gray-800">
              {assignedTo || t('ux.unassigned')}
            </span>
          </div>
        </div>

        {/* Expected duration / Due / Overdue */}
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            {workflowState?.overdue ? t('ux.overdueLabel') : t('ux.expectedDuration')}
          </span>
          <div className="mt-1 flex items-center gap-1.5">
            {workflowState?.overdue ? (
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            ) : (
              <Clock className="w-3.5 h-3.5 text-gray-500" />
            )}
            <span
              className={cn(
                'text-sm font-medium',
                workflowState?.overdue
                  ? 'text-red-700 font-semibold'
                  : workflowState?.approaching
                    ? 'text-amber-700 font-semibold'
                    : 'text-gray-800',
              )}
            >
              {durationLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
