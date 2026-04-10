'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Send,
  ClipboardCheck,
  ShieldCheck,
  ScrollText,
  Bell,
  Users as UsersIcon,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { UserRole } from '@/types/database';

interface SidebarProps {
  currentPath: string;
  userRole: UserRole;
}

interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ReactNode;
  requiresRole?: UserRole[];
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname();
  const { t, isRTL } = useI18n();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const mainItems: NavItem[] = [
    {
      labelKey: 'nav.dashboard',
      href: '/',
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      labelKey: 'nav.deliverables',
      href: '/deliverables',
      icon: <FileText className="w-5 h-5" />,
    },
    {
      labelKey: 'nav.newSubmittal',
      href: '/submittals/new',
      icon: <Send className="w-5 h-5" />,
      requiresRole: ['submitter', 'consultant', 'admin', 'department_director', 'owner'],
    },
  ];

  const workflowItems: NavItem[] = [
    {
      labelKey: 'nav.reviews',
      href: '/reviews',
      icon: <ClipboardCheck className="w-5 h-5" />,
      requiresRole: [
        'technical_unit',
        'quality_unit',
        'project_manager',
        'admin',
        'department_director',
        // legacy
        'project_coordinator',
        'owner',
      ],
    },
    {
      labelKey: 'nav.approvals',
      href: '/approvals',
      icon: <ShieldCheck className="w-5 h-5" />,
      requiresRole: [
        'project_manager',
        'department_director',
        'admin',
        // legacy
        'owner',
      ],
    },
  ];

  const systemItems: NavItem[] = [
    {
      labelKey: 'nav.auditLog',
      href: '/audit',
      icon: <ScrollText className="w-5 h-5" />,
      requiresRole: ['admin', 'project_manager', 'department_director', 'owner'],
    },
    {
      labelKey: 'nav.notifications',
      href: '/notifications',
      icon: <Bell className="w-5 h-5" />,
    },
  ];

  const adminItems: NavItem[] = [
    {
      labelKey: 'nav.users',
      href: '/users',
      icon: <UsersIcon className="w-5 h-5" />,
      requiresRole: ['admin', 'department_director', 'owner'],
    },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    const isItemActive = isActive(item.href);

    return (
      <Link
        href={item.href}
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200',
          isItemActive ? 'font-semibold' : 'text-gray-700 hover:bg-gray-50',
          isItemActive && (isRTL ? 'border-r-4' : 'border-l-4')
        )}
        style={
          isItemActive
            ? { backgroundColor: '#e6f2f2', color: '#045859', borderColor: '#045859' }
            : undefined
        }
      >
        {item.icon}
        {!isCollapsed && <span className="text-sm font-medium">{t(item.labelKey)}</span>}
      </Link>
    );
  };

  const NavSection = ({
    titleKey,
    items,
  }: {
    titleKey: string;
    items: NavItem[];
  }) => {
    const visibleItems = items.filter(
      (item) => !item.requiresRole || item.requiresRole.includes(userRole)
    );

    if (visibleItems.length === 0) return null;

    return (
      <div className="mb-6">
        {!isCollapsed && (
          <h3 className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {t(titleKey)}
          </h3>
        )}
        <div className="space-y-1">
          {visibleItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className={cn(
          'fixed top-4 z-50 p-2 lg:hidden bg-white border border-gray-200 rounded-lg hover:bg-gray-50',
          isRTL ? 'right-4' : 'left-4'
        )}
      >
        {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 h-screen bg-white border-gray-200 transition-all duration-300 z-40',
          isCollapsed ? 'w-16' : 'w-72',
          'lg:relative lg:z-auto',
          isRTL ? 'right-0 border-l' : 'left-0 border-r',
          isMobileOpen
            ? 'translate-x-0'
            : isRTL
              ? 'translate-x-full lg:translate-x-0'
              : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Header — MOMAH brand bar */}
        <div className="flex items-center justify-between h-20 px-4 border-b border-gray-200" style={{ backgroundColor: '#ffffff' }}>
          {!isCollapsed ? (
            <div className="flex items-center gap-3 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/momah-icon.png"
                alt="MOMAH"
                className="w-11 h-11 object-contain flex-shrink-0"
              />
              <div className="min-w-0">
                <h2 className="text-sm font-bold leading-tight truncate" style={{ color: '#045859' }}>
                  {t('app.name')}
                </h2>
                <p className="text-[11px] text-gray-500 leading-tight truncate">{t('app.fullName')}</p>
              </div>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src="/momah-icon.png" alt="MOMAH" className="w-8 h-8 object-contain mx-auto" />
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:block p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            title={isCollapsed ? t('nav.expand') : t('nav.collapse')}
          >
            {isCollapsed ? (
              <Menu className="w-5 h-5" style={{ color: '#045859' }} />
            ) : (
              <X className="w-5 h-5" style={{ color: '#045859' }} />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-6">
          <NavSection titleKey="nav.main" items={mainItems} />
          <NavSection titleKey="nav.workflow" items={workflowItems} />
          <NavSection titleKey="nav.system" items={systemItems} />
          <NavSection titleKey="nav.administration" items={adminItems} />
        </nav>

        {/* Footer */}
        {!isCollapsed && (
          <div className="p-4 border-t border-gray-200 text-xs text-gray-500">
            <p>{t('app.version')}</p>
          </div>
        )}
      </aside>
    </>
  );
}
