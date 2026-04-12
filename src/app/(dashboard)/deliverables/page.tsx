'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Filter,
  Download,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Circle,
  FileText,
  Layers,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { useI18n } from '@/lib/i18n'
import { useDeliverables } from '@/hooks'
import { formatDate, isPastDate } from '@/lib/utils'
import type { DeliverableSummary, DeliverableStatus, SubmittalStatus } from '@/types/database'

// ─────────────────────────────────────────────────────────────
// Traffic-light resolver
// Green   = approved
// Yellow  = submitted / under_review / resubmitted / in_progress
// Red     = past planned date & not approved
// Gray    = not_started / draft
// ─────────────────────────────────────────────────────────────
type TrafficColor = 'green' | 'yellow' | 'red' | 'gray'

function resolveTraffic(row: DeliverableSummary): TrafficColor {
  const status = row.deliverable_status
  const submittal = row.latest_submittal_status
  const overdue = isPastDate(row.planned_date) && status !== 'approved'

  if (status === 'approved' || submittal === 'approved') return 'green'
  if (overdue) return 'red'
  if (
    status === 'submitted' ||
    status === 'under_review' ||
    status === 'in_progress' ||
    submittal === 'submitted' ||
    submittal === 'under_review' ||
    submittal === 'resubmitted' ||
    submittal === 'revision_required'
  ) {
    return 'yellow'
  }
  return 'gray'
}

const TRAFFIC_STYLES: Record<TrafficColor, { bg: string; ring: string; icon: React.ReactNode; labelKey: string }> = {
  green: {
    bg: '#22c55e',
    ring: 'rgba(34,197,94,0.15)',
    icon: <CheckCircle2 className="w-4 h-4 text-white" />,
    labelKey: 'deliverables.trafficGreen',
  },
  yellow: {
    bg: '#FFC845',
    ring: 'rgba(255,200,69,0.2)',
    icon: <Clock className="w-4 h-4 text-white" />,
    labelKey: 'deliverables.trafficYellow',
  },
  red: {
    bg: '#c05728',
    ring: 'rgba(192,87,40,0.15)',
    icon: <AlertTriangle className="w-4 h-4 text-white" />,
    labelKey: 'deliverables.trafficRed',
  },
  gray: {
    bg: '#94a3b8',
    ring: 'rgba(148,163,184,0.15)',
    icon: <Circle className="w-4 h-4 text-white" />,
    labelKey: 'deliverables.trafficGray',
  },
}

function TrafficLight({ color, label }: { color: TrafficColor; label: string }) {
  const style = TRAFFIC_STYLES[color]
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full shadow-sm"
        style={{ backgroundColor: style.bg, boxShadow: `0 0 0 4px ${style.ring}` }}
      >
        {style.icon}
      </span>
      <span className="text-xs font-medium text-gray-700">{label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Status badge styles
// ─────────────────────────────────────────────────────────────
const STATUS_PALETTE: Record<DeliverableStatus, { bg: string; color: string }> = {
  not_started: { bg: '#f1f5f9', color: '#475569' },
  in_progress: { bg: '#fef3c7', color: '#92400e' },
  submitted: { bg: '#dbeafe', color: '#1e40af' },
  under_review: { bg: '#fef3c7', color: '#92400e' },
  approved: { bg: '#dcfce7', color: '#166534' },
  delayed: { bg: '#fee2e2', color: '#991b1b' },
}

function StatusPill({ status, label }: { status: DeliverableStatus; label: string }) {
  const palette = STATUS_PALETTE[status] || STATUS_PALETTE.not_started
  return (
    <span
      className="inline-block px-2.5 py-1 text-[11px] font-semibold rounded-full"
      style={{ backgroundColor: palette.bg, color: palette.color }}
    >
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Submittal status sub-chip (latest submittal)
// ─────────────────────────────────────────────────────────────
const SUB_STATUS_PALETTE: Record<SubmittalStatus, string> = {
  draft: '#94a3b8',
  submitted: '#3b82f6',
  under_review: '#FFC845',
  resubmitted: '#00a79d',
  revision_required: '#c05728',
  approved: '#22c55e',
  rejected: '#ef4444',
}

// ─────────────────────────────────────────────────────────────
// CSV export helper
// ─────────────────────────────────────────────────────────────
function exportToCsv(rows: DeliverableSummary[], filename: string) {
  const header = [
    'Code',
    'Name (EN)',
    'Name (AR)',
    'Discipline',
    'Format',
    'Phase',
    'Phase Name',
    'Status',
    'Planned Date',
    'Actual Date',
    'Revision',
    'Submittals',
    'Latest Submittal Status',
  ]
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        r.code,
        r.name,
        r.name_ar,
        r.discipline,
        r.format,
        r.phase_number,
        r.phase_name,
        r.deliverable_status,
        r.planned_date || '',
        r.actual_date || '',
        r.latest_version ?? '',
        r.total_submittals ?? 0,
        r.latest_submittal_status || '',
      ]
        .map(escape)
        .join(',')
    ),
  ]
  const csv = '\uFEFF' + lines.join('\n') // BOM for Excel UTF-8
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function DeliverablesPage() {
  const router = useRouter()
  const { t, isRTL } = useI18n()

  const [selectedPhase, setSelectedPhase] = useState<number | null>(null)
  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const filters = useMemo(() => {
    const f: Record<string, unknown> = {}
    if (selectedPhase !== null) f.phaseNumber = selectedPhase
    if (selectedDiscipline) f.discipline = selectedDiscipline
    if (selectedStatus) f.deliverableStatus = selectedStatus
    if (searchQuery) f.search = searchQuery
    return f
  }, [selectedPhase, selectedDiscipline, selectedStatus, searchQuery])

  const { data: deliverables, isLoading } = useDeliverables(filters)

  const rows = deliverables || []

  const phases = useMemo(() => {
    const uniquePhases = new Set<number>()
    rows.forEach((d) => uniquePhases.add(d.phase_number))
    return Array.from(uniquePhases).sort((a, b) => a - b)
  }, [rows])

  const disciplines = useMemo(() => {
    const uniqueDisciplines = new Set<string>()
    rows.forEach((d) => uniqueDisciplines.add(d.discipline))
    return Array.from(uniqueDisciplines).sort()
  }, [rows])

  const statuses: DeliverableStatus[] = [
    'not_started',
    'in_progress',
    'submitted',
    'under_review',
    'approved',
    'delayed',
  ]

  // Stats strip
  const stats = useMemo(() => {
    const total = rows.length
    let approved = 0
    let inReview = 0
    let delayed = 0
    let notStarted = 0
    rows.forEach((r) => {
      const t = resolveTraffic(r)
      if (t === 'green') approved++
      else if (t === 'yellow') inReview++
      else if (t === 'red') delayed++
      else notStarted++
    })
    return { total, approved, inReview, delayed, notStarted }
  }, [rows])

  const handleRowClick = (row: DeliverableSummary) => {
    router.push(`/deliverables/${row.deliverable_id}`)
  }

  const handleExport = () => {
    const ts = new Date().toISOString().slice(0, 10)
    exportToCsv(rows, `deliverables-register-${ts}.csv`)
  }

  const clearFilters = () => {
    setSelectedPhase(null)
    setSelectedDiscipline(null)
    setSelectedStatus(null)
    setSearchQuery('')
  }

  const hasActiveFilters =
    selectedPhase !== null || selectedDiscipline !== null || selectedStatus !== null || searchQuery !== ''

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deliverables Register"
        titleAr="سجل المخرجات"
        description={t('deliverables.registerDescription')}
        actions={
          <button
            onClick={handleExport}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md"
            style={{ backgroundColor: '#045859', color: 'white' }}
          >
            <Download className="w-4 h-4" />
            {t('deliverables.exportCsv')}
          </button>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          icon={<Layers className="w-5 h-5" />}
          label={t('deliverables.totalDeliverables')}
          value={stats.total}
          color="#045859"
          bg="#e6f2f2"
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label={t('deliverables.statApproved')}
          value={stats.approved}
          color="#166534"
          bg="#dcfce7"
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label={t('deliverables.statInReview')}
          value={stats.inReview}
          color="#92400e"
          bg="#fef3c7"
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label={t('deliverables.statDelayed')}
          value={stats.delayed}
          color="#991b1b"
          bg="#fee2e2"
        />
        <StatCard
          icon={<Circle className="w-5 h-5" />}
          label={t('deliverables.statNotStarted')}
          value={stats.notStarted}
          color="#475569"
          bg="#f1f5f9"
        />
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4" style={{ color: '#045859' }} />
          <h3 className="text-sm font-semibold text-gray-700">
            {t('deliverables.filters')}
          </h3>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ms-auto inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              <X className="w-3 h-3" />
              {t('deliverables.clearFilters')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder={t('deliverables.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full ps-10 pe-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ ['--tw-ring-color' as string]: '#045859' }}
            />
          </div>

          <select
            value={selectedPhase ?? ''}
            onChange={(e) => setSelectedPhase(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2"
            style={{ ['--tw-ring-color' as string]: '#045859' }}
          >
            <option value="">{t('deliverables.allPhases')}</option>
            {phases.map((phase) => (
              <option key={phase} value={phase}>
                {t('deliverables.phase')} {phase}
              </option>
            ))}
          </select>

          <select
            value={selectedDiscipline ?? ''}
            onChange={(e) => setSelectedDiscipline(e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2"
            style={{ ['--tw-ring-color' as string]: '#045859' }}
          >
            <option value="">{t('deliverables.allDisciplines')}</option>
            {disciplines.map((d) => (
              <option key={d} value={d}>
                {t(`disciplines.${d}`) || d}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus ?? ''}
            onChange={(e) => setSelectedStatus(e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2"
            style={{ ['--tw-ring-color' as string]: '#045859' }}
          >
            <option value="">{t('deliverables.allStatuses')}</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Register Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <Th>{t('deliverables.indicator')}</Th>
                <Th>{t('deliverables.code')}</Th>
                <Th>{t('deliverables.name')}</Th>
                <Th className="hidden lg:table-cell">{t('deliverables.discipline')}</Th>
                <Th className="hidden md:table-cell">{t('deliverables.phase')}</Th>
                <Th>{t('deliverables.status')}</Th>
                <Th className="hidden md:table-cell">{t('deliverables.revision')}</Th>
                <Th className="hidden lg:table-cell">{t('deliverables.plannedDate')}</Th>
                <Th>{t('deliverables.submittals')}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <FileText className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500 text-sm">{t('deliverables.noResults')}</p>
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const traffic = resolveTraffic(row)
                  const overdue = traffic === 'red'
                  const rowStyle: React.CSSProperties = overdue
                    ? {
                        backgroundColor: '#fef2f2',
                        borderInlineStart: '3px solid #c05728',
                      }
                    : {}
                  const primary = isRTL ? row.name_ar : row.name
                  const secondary = isRTL ? row.name : row.name_ar
                  return (
                    <tr
                      key={row.deliverable_id}
                      onClick={() => handleRowClick(row)}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      style={rowStyle}
                    >
                      <td className="px-4 py-3">
                        <TrafficLight
                          color={traffic}
                          label={t(TRAFFIC_STYLES[traffic].labelKey)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-block px-2 py-1 rounded font-mono text-xs font-bold"
                          style={{ backgroundColor: '#e6f2f2', color: '#045859' }}
                        >
                          {row.code}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-medium text-gray-900 truncate" title={primary || undefined}>
                          {primary || '—'}
                        </div>
                        {secondary && (
                          <div
                            className="text-xs text-gray-500 truncate"
                            dir={isRTL ? 'ltr' : 'rtl'}
                            title={secondary}
                          >
                            {secondary}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span
                          className="inline-block px-2 py-1 text-[11px] font-medium rounded-md"
                          style={{ backgroundColor: '#eff6f6', color: '#045859' }}
                        >
                          {t(`disciplines.${row.discipline}`) || row.discipline}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span
                          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700"
                        >
                          <span
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: '#87ba26' }}
                          >
                            {row.phase_number}
                          </span>
                          M{row.phase_number}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill
                          status={row.deliverable_status}
                          label={t(`status.${row.deliverable_status}`)}
                        />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {row.latest_version ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold border"
                            style={{
                              borderColor: '#00a79d',
                              color: '#00a79d',
                              backgroundColor: '#f0fdfc',
                            }}
                          >
                            {t('deliverables.revision')} {row.latest_version}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400">
                            {t('deliverables.noRevision')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-col">
                          <span
                            className={`text-xs ${
                              overdue ? 'font-semibold' : 'text-gray-600'
                            }`}
                            style={overdue ? { color: '#c05728' } : undefined}
                          >
                            {row.planned_date ? formatDate(row.planned_date) : '—'}
                          </span>
                          {overdue && (
                            <span className="text-[10px] font-semibold uppercase" style={{ color: '#c05728' }}>
                              {t('deliverables.pastDue')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 text-xs font-bold rounded-full"
                            style={{
                              backgroundColor: row.total_submittals > 0 ? '#045859' : '#f1f5f9',
                              color: row.total_submittals > 0 ? 'white' : '#94a3b8',
                            }}
                          >
                            {row.total_submittals || 0}
                          </span>
                          {row.latest_submittal_status && (
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{
                                backgroundColor:
                                  SUB_STATUS_PALETTE[row.latest_submittal_status] || '#94a3b8',
                              }}
                              title={t(`status.${row.latest_submittal_status}`)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        {!isLoading && rows.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
            {t('deliverables.showing')} <strong>{rows.length}</strong> {t('deliverables.of')}{' '}
            <strong>{rows.length}</strong> {t('deliverables.title').toLowerCase()}
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        className="rounded-lg p-4 flex items-center gap-3 border"
        style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
      >
        <AlertTriangle className="w-5 h-5" style={{ color: '#c05728' }} />
        <p className="text-sm" style={{ color: '#991b1b' }}>
          {t('deliverables.redHighlight')}
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Reusable sub-components
// ─────────────────────────────────────────────────────────────
function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-start ${className}`}
    >
      {children}
    </th>
  )
}

function StatCard({
  icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
  bg: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: bg, color }}
        >
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold" style={{ color }}>
            {value}
          </div>
          <div className="text-xs font-medium text-gray-600">{label}</div>
        </div>
      </div>
    </div>
  )
}
