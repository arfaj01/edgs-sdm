'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

type SubmittalStatus = 'draft' | 'submitted' | 'under_review' | 'revision_required' | 'resubmitted' | 'approved' | 'rejected';
type DeliverableStatus = 'not_started' | 'in_progress' | 'under_review' | 'revision_required' | 'resubmitted' | 'approved' | 'delayed' | 'rejected';

type Status = SubmittalStatus | DeliverableStatus;

interface StatusBadgeProps {
  status: Status;
  size?: 'sm' | 'md';
}

const STATUS_COLORS: Record<Status, string> = {
  draft: 'bg-gray-100 text-gray-800',
  submitted: 'bg-blue-100 text-blue-800',
  under_review: 'bg-amber-100 text-amber-800',
  revision_required: 'bg-orange-100 text-orange-800',
  resubmitted: 'bg-purple-100 text-purple-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  not_started: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  delayed: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const { t } = useI18n();
  const color = STATUS_COLORS[status];
  const label = t(`status.${status}`);

  if (!color) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium transition-colors duration-200',
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        color
      )}
    >
      {label}
    </span>
  );
}
