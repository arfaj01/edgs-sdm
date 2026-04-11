'use client';

import React from 'react';
import { Clock, User as UserIcon, Layers } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { StatusBadge } from './status-badge';
import type { SubmittalStatus, SubmittalStage } from '@/types/database';

interface SmartHeaderProps {
  status: SubmittalStatus;
  stage: SubmittalStage;
  assignedTo?: string | null;
  submittalNumber?: string;
  className?: string;
}

/**
 * Status bar at the top of any submittal page. Shows:
 *   - Status badge (translated)
 *   - Current stage label (Technical/Quality/PM)
 *   - Assigned user (if available)
 *   - Expected turnaround placeholder
 *
 * Designed as a non-intrusive info strip that appears above the existing page header.
 */
export function SmartHeader({
  status,
  stage,
  assignedTo,
  submittalNumber,
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

  return (
    <div
      className={cn(
        'rounded-lg border shadow-sm mb-6',
        'bg-gradient-to-r from-[#e6f2f2] to-white border-[#045859]/20',
        className
      )}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Title */}
        <div className="flex items-center gap-2 min-w-[160px]">
          <div className="w-1 h-8 rounded-full bg-[#045859]" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
              {t('ux.smartHeaderTitle')}
            </p>
            {submittalNumber && (
              <p className="text-sm font-bold text-[#045859]">{submittalNumber}</p>
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

        {/* Expected duration */}
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            {t('ux.expectedDuration')}
          </span>
          <div className="mt-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-sm font-medium text-gray-800">
              {t('ux.expectedDurationPlaceholder')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
