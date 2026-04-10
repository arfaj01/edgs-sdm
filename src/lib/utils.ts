import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';
import { SubmittalStatus, ActionCode } from '@/types/database';

/**
 * Merge Tailwind CSS classes safely
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string (ISO 8601) to a readable format
 */
export function formatDate(
  dateString: string | null | undefined,
  formatStr: string = 'MMM dd, yyyy'
): string {
  if (!dateString) return '';

  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    return format(date, formatStr);
  } catch {
    return dateString;
  }
}

/**
 * Get Tailwind color classes for submittal status
 */
export function getStatusColor(status: SubmittalStatus): string {
  const statusColorMap: Record<SubmittalStatus, string> = {
    draft: 'bg-gray-100 text-gray-800',
    submitted: 'bg-blue-100 text-blue-800',
    under_review: 'bg-yellow-100 text-yellow-800',
    revision_required: 'bg-orange-100 text-orange-800',
    resubmitted: 'bg-blue-100 text-blue-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };

  return statusColorMap[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Get human-readable label for submittal status
 */
export function getStatusLabel(status: SubmittalStatus): string {
  const statusLabelMap: Record<SubmittalStatus, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    under_review: 'Under Review',
    revision_required: 'Revision Required',
    resubmitted: 'Resubmitted',
    approved: 'Approved',
    rejected: 'Rejected',
  };

  return statusLabelMap[status] || status;
}

/**
 * Get human-readable label for action codes (A, B, C, D)
 */
export function getActionCodeLabel(actionCode: ActionCode): string {
  const actionCodeLabelMap: Record<ActionCode, string> = {
    A: 'Approved',
    B: 'Approved with Comments',
    C: 'Rejected',
    D: 'Hold',
  };

  return actionCodeLabelMap[actionCode] || actionCode;
}

/**
 * Get Tailwind color classes for action codes
 */
export function getActionCodeColor(actionCode: ActionCode): string {
  const actionCodeColorMap: Record<ActionCode, string> = {
    A: 'bg-green-100 text-green-800',
    B: 'bg-yellow-100 text-yellow-800',
    C: 'bg-red-100 text-red-800',
    D: 'bg-gray-100 text-gray-800',
  };

  return actionCodeColorMap[actionCode] || 'bg-gray-100 text-gray-800';
}

/**
 * Get description for action codes
 */
export function getActionCodeDescription(actionCode: ActionCode): string {
  const actionCodeDescriptionMap: Record<ActionCode, string> = {
    A: 'Approved without comments',
    B: 'Approved with comments or minor revisions',
    C: 'Rejected - Major revisions required',
    D: 'On Hold - Pending further review',
  };

  return actionCodeDescriptionMap[actionCode] || '';
}

/**
 * Format file size to human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Parse and format a date with time
 */
export function formatDateTime(
  dateString: string | null | undefined,
  formatStr: string = 'MMM dd, yyyy HH:mm'
): string {
  if (!dateString) return '';

  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    return format(date, formatStr);
  } catch {
    return dateString;
  }
}

/**
 * Check if a date is in the past
 */
export function isPastDate(dateString: string | null | undefined): boolean {
  if (!dateString) return false;

  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    return date < new Date();
  } catch {
    return false;
  }
}

/**
 * Check if a date is within a certain number of days
 */
export function isDueWithinDays(dateString: string | null | undefined, days: number): boolean {
  if (!dateString) return false;

  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    const now = new Date();
    const dueDate = new Date(date.getTime() - days * 24 * 60 * 60 * 1000);

    return now >= dueDate && now < date;
  } catch {
    return false;
  }
}
