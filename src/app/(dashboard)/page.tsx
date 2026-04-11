'use client';

import React, { useState } from 'react';
import {
  Package,
  CheckCircle,
  AlertCircle,
  TrendingDown,
  Clock,
  Users,
  ChevronDown,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

import Link from 'next/link';
import { FilePlus, ClipboardList, ShieldCheck, Inbox } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { DataTable } from '@/components/ui/data-table';
import { useI18n } from '@/lib/i18n';
import { useDashboardKPIs } from '@/hooks/use-dashboard';
import { useProjects } from '@/hooks/use-project';
import { useUser } from '@/hooks/use-user';
import { formatDate, getActionCodeLabel } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { t } = useI18n();
  const { user } = useUser();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const { data: kpiData, isLoading: kpisLoading } = useDashboardKPIs(selectedProjectId);

  // Set default project if available
  React.useEffect(() => {
    if (!selectedProjectId && projects && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const isLoading = projectsLoading || kpisLoading;

  const summary = kpiData?.summary || {
    total_deliverables: 0,
    approved_count: 0,
    rejected_count: 0,
    pending_review_count: 0,
    in_revision_count: 0,
  };

  const phaseProgress = kpiData?.phase_progress || [];
  const delayedDeliverables = kpiData?.delayed_deliverables || [];
  const consultantPerformance = kpiData?.consultant_performance || [];
  const actionCodeDistribution = kpiData?.action_code_distribution || [];

  const submitted = summary.approved_count + summary.in_revision_count + summary.pending_review_count;
  const approved = summary.approved_count;
  const rejectionRate = summary.total_deliverables > 0
    ? Math.round(((summary.rejected_count) / summary.total_deliverables) * 100)
    : 0;
  const avgApprovalDays = kpiData?.summary?.avg_approval_days || 0;

  const pieChartData = actionCodeDistribution.map((item) => ({
    name: t(`actions.${item.code}`),
    value: item.total_count,
    code: item.code,
  }));

  const pieColors: Record<string, string> = {
    A: '#87ba26',
    B: '#FFC845',
    C: '#c05728',
    D: '#54565b',
  };

  const phaseChartData = phaseProgress.map((phase) => ({
    name: `${t('deliverables.phase')} ${phase.phase_number}`,
    completed: phase.approved_count,
    inProgress: phase.in_progress_count,
    notStarted: phase.not_started_count,
    percentage: Math.round(phase.completion_pct),
  }));

  const delayedColumns = [
    { key: 'deliverable_code' as const, label: t('deliverables.code'), sortable: true },
    { key: 'project_name' as const, label: t('entities.project'), sortable: true },
    {
      key: 'phase_number' as const,
      label: t('deliverables.phase'),
      sortable: true,
      render: (value: number) => `${t('deliverables.phase')} ${value}`,
    },
    {
      key: 'days_delayed' as const,
      label: t('dashboard.delayedDeliverables'),
      sortable: true,
      render: (value: number) => (
        <span className="text-red-600 font-semibold">{value}</span>
      ),
    },
    {
      key: 'current_status' as const,
      label: t('deliverables.status'),
      render: (value: string) => <StatusBadge status={value as any} size="sm" />,
    },
  ];

  const consultantColumns = [
    { key: 'consultant_name' as const, label: t('dashboard.consultants'), sortable: true },
    { key: 'total_submittals' as const, label: t('deliverables.submittals'), sortable: true },
    { key: 'total_approved' as const, label: t('dashboard.approved'), sortable: true },
    { key: 'total_rejected' as const, label: t('dashboard.rejected'), sortable: true },
    {
      key: 'first_time_approval_rate' as const,
      label: t('dashboard.rejectionRate'),
      sortable: true,
      render: (value: number) => (
        <div className="flex items-center gap-2">
          <div className="w-16 bg-gray-200 rounded-full h-2">
            <div
              className={cn(
                'h-2 rounded-full transition-all',
                value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-amber-500' : 'bg-red-500'
              )}
              style={{ width: `${value}%` }}
            />
          </div>
          <span className="text-sm font-medium">{Math.round(value)}%</span>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        titleAr="لوحة التحكم"
        description={t('dashboard.description')}
      />

      {/* Role-based landing section — shows each user the first thing they need to do */}
      {user && <RoleBasedHero role={user.role} />}

      {/* Project Selector */}
      {projects && projects.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">{t('dashboard.selectProject')}</label>
          <div className="relative">
            <select
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className={cn(
                'appearance-none px-4 py-2 rounded-lg border border-gray-300',
                'bg-white text-gray-900 text-sm font-medium',
                'hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent',
                'cursor-pointer'
              )}
            >
              <option value="">{t('dashboard.allProjects')}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none ltr:right-3 rtl:left-3" style={{ right: 'auto', left: '0.75rem' }} />
          </div>
        </div>
      )}

      {/* KPI Summary Cards */}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label={t('dashboard.totalDeliverables')} value={summary.total_deliverables} icon={Package} color="blue"
            trend={summary.total_deliverables > 0 ? { value: Math.round((summary.approved_count / summary.total_deliverables) * 100), direction: 'up' } : undefined}
          />
          <StatCard label={t('dashboard.submitted')} value={submitted} icon={CheckCircle} color="green" />
          <StatCard label={t('dashboard.approved')} value={approved} icon={CheckCircle} color="green" />
          <StatCard label={t('dashboard.rejectionRate')} value={`${rejectionRate}%`} icon={AlertCircle} color={rejectionRate > 20 ? 'red' : rejectionRate > 10 ? 'amber' : 'green'} />
          <StatCard label={t('dashboard.avgApprovalDays')} value={avgApprovalDays} icon={Clock} color="purple" />
        </div>
      )}

      {/* Phase Progress Section */}
      {phaseProgress.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-6">{t('dashboard.phaseProgress')}</h2>
          <div className="space-y-4">
            {phaseProgress.map((phase) => (
              <div key={phase.phase_number} className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      {t('deliverables.phase')} {phase.phase_number}: {phase.phase_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {phase.approved_count}/{phase.approved_count + phase.in_progress_count + phase.not_started_count} {t('dashboard.completed')}
                    </p>
                  </div>
                  <span className="text-lg font-bold text-gray-900">{Math.round(phase.completion_pct)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div className="h-full transition-all duration-300 rounded-full" style={{ width: `${phase.completion_pct}%`, backgroundColor: '#045859' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {actionCodeDistribution.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-6">{t('dashboard.actionCodeDist')}</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieChartData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={80} fill="#8884d8" dataKey="value">
                  {actionCodeDistribution.map((item) => (
                    <Cell key={`cell-${item.code}`} fill={pieColors[item.code] || '#54565b'} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [value, '']} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {phaseChartData.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-6">{t('dashboard.phaseCompletion')}</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={phaseChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#54565b" />
                <YAxis stroke="#54565b" />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }} />
                <Legend />
                <Bar dataKey="completed" stackId="a" fill="#87ba26" name={t('dashboard.completed')} />
                <Bar dataKey="inProgress" stackId="a" fill="#045859" name={t('dashboard.inProgress')} />
                <Bar dataKey="notStarted" stackId="a" fill="#e5e7eb" name={t('dashboard.notStarted')} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Delayed Deliverables */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <TrendingDown className="w-5 h-5 text-red-600" />
          <h2 className="text-lg font-bold text-gray-900">{t('dashboard.delayedDeliverables')}</h2>
          {delayedDeliverables.length > 0 && (
            <span className="bg-red-100 text-red-800 text-xs font-semibold px-3 py-1 rounded-full" style={{ marginInlineStart: 'auto' }}>
              {delayedDeliverables.length}
            </span>
          )}
        </div>
        <DataTable<any>
          columns={delayedColumns}
          data={delayedDeliverables}
          loading={isLoading}
          emptyMessage={t('dashboard.excellentProgress')}
        />
      </div>

      {/* Consultant Performance */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-5 h-5" style={{ color: '#045859' }} />
          <h2 className="text-lg font-bold text-gray-900">{t('dashboard.consultantPerformance')}</h2>
          {consultantPerformance.length > 0 && (
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ marginInlineStart: 'auto', backgroundColor: '#e6f2f2', color: '#045859' }}>
              {consultantPerformance.length} {t('dashboard.consultants')}
            </span>
          )}
        </div>
        <DataTable<any>
          columns={consultantColumns}
          data={consultantPerformance}
          loading={isLoading}
          emptyMessage={t('common.noData')}
        />
      </div>

      {/* Summary Footer */}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 rounded-lg p-6 border border-gray-200">
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: '#87ba26' }}>{summary.approved_count}</p>
            <p className="text-sm text-gray-600">{t('dashboard.approved')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-600">{summary.in_revision_count}</p>
            <p className="text-sm text-gray-600">{t('dashboard.inRevision')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: '#c05728' }}>{summary.rejected_count}</p>
            <p className="text-sm text-gray-600">{t('dashboard.rejected')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Role-based hero — shows each role the primary action they need
// ─────────────────────────────────────────────────────────────
function RoleBasedHero({ role }: { role: string }) {
  const { t } = useI18n();

  if (role === 'submitter') {
    return (
      <div className="rounded-lg border-2 border-[#045859]/20 bg-gradient-to-r from-[#e6f2f2] to-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-[#045859] flex items-center justify-center flex-shrink-0">
              <FilePlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#045859]">{t('ux.dashboardSubmitter')}</h2>
              <p className="text-sm text-gray-600 mt-1">{t('ux.dashboardSubmitterDesc')}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link
              href="/submittals/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#045859] text-white font-semibold text-sm hover:bg-[#034849] transition-colors"
            >
              <FilePlus className="w-4 h-4" />
              {t('ux.dashboardNewSubmittal')}
            </Link>
            <Link
              href="/deliverables"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#045859] text-[#045859] font-semibold text-sm hover:bg-[#e6f2f2] transition-colors"
            >
              {t('ux.dashboardViewAll')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (role === 'technical_unit' || role === 'quality_unit' || role === 'project_coordinator') {
    return (
      <div className="rounded-lg border-2 border-[#045859]/20 bg-gradient-to-r from-[#e6f2f2] to-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-[#045859] flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#045859]">{t('ux.dashboardReviewer')}</h2>
              <p className="text-sm text-gray-600 mt-1">{t('ux.dashboardReviewerDesc')}</p>
            </div>
          </div>
          <Link
            href="/deliverables"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#045859] text-white font-semibold text-sm hover:bg-[#034849] transition-colors"
          >
            <Inbox className="w-4 h-4" />
            {t('ux.dashboardViewAll')}
          </Link>
        </div>
      </div>
    );
  }

  if (role === 'project_manager') {
    return (
      <div className="rounded-lg border-2 border-[#045859]/20 bg-gradient-to-r from-[#e6f2f2] to-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-[#045859] flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#045859]">{t('ux.dashboardPM')}</h2>
              <p className="text-sm text-gray-600 mt-1">{t('ux.dashboardPMDesc')}</p>
            </div>
          </div>
          <Link
            href="/deliverables"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#045859] text-white font-semibold text-sm hover:bg-[#034849] transition-colors"
          >
            <Inbox className="w-4 h-4" />
            {t('ux.dashboardViewAll')}
          </Link>
        </div>
      </div>
    );
  }

  // admin / director / legacy — no hero, they already have the full sidebar
  return null;
}
