'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, LogOut, User } from 'lucide-react';
import { Sidebar } from '@/components/ui/sidebar';
import { LanguageSwitcher, useI18n } from '@/lib/i18n';
import { useUser, useSupabase } from '@/hooks';
import type { UserRole } from '@/types/database';
import type { Notification } from '@/types/database';

interface LayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: LayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useSupabase();
  const { user, isLoading: userLoading } = useUser();
  const { t, isRTL } = useI18n();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);

  // Fetch real notifications
  useEffect(() => {
    if (!user) return;

    async function fetchNotifications() {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        setNotifications(data as Notification[]);
        setNotificationCount(data.length);
      }
    }

    fetchNotifications();
  }, [user, supabase]);

  // Logout handler
  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  // Get display info from real user
  const userName = user?.full_name || t('common.loading');
  const userInitials = user
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '..';
  const userRole: UserRole = user?.role || 'consultant';

  // Show loading while user is being fetched
  if (userLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4" style={{ borderColor: '#045859' }}></div>
          <p className="text-gray-600 text-sm">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // If no user after loading, redirect
  if (!user && !userLoading) {
    router.push('/login');
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-100 print:h-auto print:block print:bg-white">
      {/* Sidebar */}
      <div className="print:hidden">
        <Sidebar currentPath={pathname} userRole={userRole} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:block">
        {/* Header Bar */}
        <header className="h-20 bg-white border-b border-gray-200 px-6 flex items-center justify-between sticky top-0 z-30 print:hidden">
          {/* Project Name + Ministry Logo */}
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/momah-logo-horizontal.png"
              alt="MOMAH"
              className="h-12 w-auto object-contain"
            />
            <div className="border-s border-gray-300 ps-4">
              <h1 className="text-base font-bold leading-tight" style={{ color: '#045859' }}>
                {t('app.fullName')}
              </h1>
              <p className="text-xs text-gray-500 leading-tight">{t('app.subtitle')}</p>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <LanguageSwitcher />

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
              >
                <Bell className="w-5 h-5" />
                {notificationCount > 0 && (
                  <span className="absolute top-0 right-0 w-5 h-5 bg-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {notificationCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {notificationsOpen && (
                <div className={`absolute mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 ${isRTL ? 'left-0' : 'right-0'}`}>
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900">{t('header.notifications')}</h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-sm text-gray-500">
                        {t('header.noNotifications')}
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <p className="text-sm font-medium text-gray-900">{notif.title}</p>
                          <p className="text-xs text-gray-600 mt-1">{notif.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Avatar Dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #045859, #00a79d)' }}>
                  {userInitials}
                </div>
                <span className="hidden sm:block text-sm font-medium text-gray-700">{userName}</span>
              </button>

              {/* User Menu Dropdown */}
              {userMenuOpen && (
                <div className={`absolute mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50 ${isRTL ? 'left-0' : 'right-0'}`}>
                  <div className="p-3 border-b border-gray-200">
                    <p className="text-sm font-medium text-gray-900">{userName}</p>
                    <p className="text-xs text-gray-500 capitalize">{userRole.replace('_', ' ')}</p>
                  </div>
                  <nav className="p-2 space-y-1">
                    <a
                      href="#"
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <User className="w-4 h-4" />
                      {t('header.profile')}
                    </a>
                  </nav>
                  <div className="p-2 border-t border-gray-200">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      {t('header.logout')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto print:overflow-visible">
          <div className="p-6 lg:p-8 max-w-7xl mx-auto print:p-0 print:max-w-none">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
