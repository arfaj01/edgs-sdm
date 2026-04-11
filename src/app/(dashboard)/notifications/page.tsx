'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Check, FileText, Inbox, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { useI18n } from '@/lib/i18n';
import { useSupabase } from '@/hooks/use-supabase';
import { useUser } from '@/hooks/use-user';
import { cn, formatDateTime } from '@/lib/utils';
import type { Notification } from '@/types/database';

/**
 * /notifications — user's notification inbox.
 * Reads rows from the `notifications` table for the current user,
 * ordered by created_at desc. Supports mark-read and mark-all-read.
 *
 * The table schema is documented in types/database.ts:Notification.
 * Rows are created by the `generate_workflow_notifications()` DB trigger
 * on every workflow transition.
 */
export default function NotificationsPage() {
  const { t, isRTL } = useI18n();
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const { user } = useUser();

  const { data: notifications, isLoading, error } = useQuery<Notification[], Error>({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error: err } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (err) throw err;
      return (data || []) as Notification[];
    },
    enabled: !!user?.id,
  });

  const unreadCount = React.useMemo(
    () => (notifications || []).filter((n) => !n.is_read).length,
    [notifications],
  );

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
      if (err) throw err;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error: err } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      if (err) throw err;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });

  /**
   * Build a navigable href for a notification. Notifications about
   * submittals link into the most relevant page based on viewer role,
   * falling back to the deliverables list.
   */
  const hrefFor = (n: Notification): string => {
    if (n.entity_type === 'submittal' && n.entity_id) {
      // Prefer the review page for reviewers, approval page for PM.
      const role = user?.role;
      if (role === 'project_manager' || role === 'department_director' || role === 'owner') {
        return `/approvals/${n.entity_id}`;
      }
      return `/reviews/${n.entity_id}`;
    }
    if (n.entity_type === 'deliverable' && n.entity_id) {
      return `/deliverables/${n.entity_id}`;
    }
    return '/deliverables';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title={t('notificationsPage.title')}
          description={t('notificationsPage.description')}
        />

        {/* Header strip */}
        <div className="flex items-center justify-between mb-4 bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5" style={{ color: '#045859' }} />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                {t('notificationsPage.unread')}
              </p>
              <p className="text-2xl font-bold text-gray-900">{unreadCount}</p>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-white transition disabled:opacity-60"
              style={{ backgroundColor: '#045859' }}
            >
              <Check className="w-3.5 h-3.5" />
              {t('notificationsPage.markAllRead')}
            </button>
          )}
        </div>

        {/* List */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {isLoading && (
            <div className="p-12 text-center text-gray-500">{t('common.loading')}</div>
          )}

          {error && (
            <div className="p-6 text-center text-red-600 bg-red-50 border-b border-red-200">
              {t('common.error')}: {error.message}
            </div>
          )}

          {!isLoading && !error && (notifications || []).length === 0 && (
            <div className="p-12 text-center">
              <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">{t('notificationsPage.emptyTitle')}</p>
              <p className="text-sm text-gray-400 mt-1">{t('notificationsPage.emptyDesc')}</p>
            </div>
          )}

          {!isLoading && !error && (notifications || []).length > 0 && (
            <ul className="divide-y divide-gray-100">
              {(notifications || []).map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'p-4 flex items-start gap-3 transition-colors hover:bg-gray-50',
                    !n.is_read && 'bg-[#e6f2f2]/40',
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                      n.is_read ? 'bg-gray-100 text-gray-400' : 'text-white',
                    )}
                    style={!n.is_read ? { backgroundColor: '#045859' } : undefined}
                  >
                    {n.is_read ? (
                      <BellOff className="w-4 h-4" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          'text-sm',
                          n.is_read ? 'text-gray-700' : 'font-semibold text-gray-900',
                        )}
                      >
                        {n.title}
                      </p>
                      <span className="text-[11px] text-gray-400 shrink-0">
                        {formatDateTime(n.created_at)}
                      </span>
                    </div>
                    {n.message && (
                      <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{n.message}</p>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      <Link
                        href={hrefFor(n)}
                        onClick={() => {
                          if (!n.is_read) markRead.mutate(n.id);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium"
                        style={{ color: '#045859' }}
                      >
                        {t('notificationsPage.open')}
                        <ArrowRight className={cn('w-3 h-3', isRTL && 'rotate-180')} />
                      </Link>
                      {!n.is_read && (
                        <button
                          type="button"
                          onClick={() => markRead.mutate(n.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                        >
                          <Check className="w-3 h-3" />
                          {t('notificationsPage.markRead')}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
