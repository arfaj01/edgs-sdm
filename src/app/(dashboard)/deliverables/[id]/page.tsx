'use client'

import { useParams, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { useI18n } from '@/lib/i18n'
import { useDeliverable, useWorkflowTransition, useUser } from '@/hooks'
import { formatDate } from '@/lib/utils'
import type { SubmittalStatus, UserRole, WorkflowTrigger } from '@/types/database'
import { Send, PlayCircle, RotateCcw, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

export default function DeliverableDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { t } = useI18n()

  const { data: deliverable, isLoading } = useDeliverable(id)
  const { user } = useUser()
  const transition = useWorkflowTransition()

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const sortedSubmittals = useMemo(() => {
    if (!deliverable?.submittals) return []
    return [...deliverable.submittals].sort((a, b) => b.version - a.version)
  }, [deliverable?.submittals])

  const latestSubmittal = sortedSubmittals[0] ?? null

  const latestHasDocuments = useMemo(() => {
    if (!latestSubmittal) return false
    return (latestSubmittal as any).documents?.length > 0 || false
  }, [latestSubmittal])

  function getAvailableActions(status: SubmittalStatus, role: UserRole, hasDocuments: boolean) {
    const actions: { trigger: WorkflowTrigger; labelKey: string; icon: React.ReactNode; color: string; descKey: string; needsDocs: boolean }[] = []

    if (status === 'draft' && (role === 'consultant' || role === 'admin')) {
      actions.push({
        trigger: 'consultant_submit',
        labelKey: 'deliverables.submitForReview',
        icon: <Send className="w-4 h-4" />,
        color: 'text-white',
        descKey: hasDocuments ? 'deliverables.beginReviewing' : 'review.attachFirst',
        needsDocs: !hasDocuments,
      })
    }

    if ((status === 'submitted' || status === 'resubmitted') && (role === 'project_coordinator' || role === 'admin')) {
      actions.push({
        trigger: 'coordinator_pickup',
        labelKey: 'deliverables.pickUpReview',
        icon: <PlayCircle className="w-4 h-4" />,
        color: 'bg-amber-600 hover:bg-amber-700 text-white',
        descKey: 'deliverables.beginReviewing',
        needsDocs: false,
      })
    }

    if (status === 'revision_required' && (role === 'consultant' || role === 'admin')) {
      actions.push({
        trigger: 'consultant_resubmit',
        labelKey: 'deliverables.resubmit',
        icon: <RotateCcw className="w-4 h-4" />,
        color: 'bg-indigo-600 hover:bg-indigo-700 text-white',
        descKey: hasDocuments ? 'deliverables.beginReviewing' : 'review.attachFirst',
        needsDocs: !hasDocuments,
      })
    }

    return actions
  }

  const actions = useMemo(() => {
    if (!latestSubmittal || !user) return []
    return getAvailableActions(latestSubmittal.status as SubmittalStatus, user.role, latestHasDocuments)
  }, [latestSubmittal, user, latestHasDocuments])

  async function handleAction(trigger: WorkflowTrigger) {
    if (!latestSubmittal) return
    setFeedback(null)

    if ((trigger === 'consultant_submit' || trigger === 'consultant_resubmit') && !latestHasDocuments) {
      setFeedback({ type: 'error', message: t('review.attachFirst') })
      return
    }

    try {
      const result = await transition.mutateAsync({ submittal_id: latestSubmittal.id, trigger_name: trigger })
      if (result.success) {
        setFeedback({ type: 'success', message: `${t('status.' + result.old_status)} → ${t('status.' + result.new_status)}` })
      } else {
        setFeedback({ type: 'error', message: (result as any).error || t('common.error') })
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || t('common.error') })
    }
  }

  if (isLoading || !deliverable) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 mb-4">{t('common.loading')}</p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: '#045859' }}></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
          {t('deliverables.back')}
        </button>
      </div>

      <PageHeader title={deliverable.name} titleAr={deliverable.name_ar} />

      {feedback && (
        <div className={`flex items-center gap-3 p-4 rounded-lg border ${feedback.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {feedback.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <XCircle className="w-5 h-5 flex-shrink-0" />}
          <p className="text-sm font-medium">{feedback.message}</p>
          <button onClick={() => setFeedback(null)} className="text-sm underline opacity-70 hover:opacity-100" style={{ marginInlineStart: 'auto' }}>{t('common.dismiss')}</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('deliverables.code')}</p>
                <p className="mt-1 text-lg font-mono font-bold" style={{ color: '#045859' }}>{deliverable.code}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('deliverables.discipline')}</p>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  <span className="inline-block px-3 py-1 rounded-full" style={{ backgroundColor: '#e6f2f2', color: '#045859' }}>{deliverable.discipline}</span>
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('deliverables.name')}</p>
              <div className="space-y-2">
                <p className="text-base font-medium text-gray-900">{deliverable.name}</p>
                <p className="text-base font-medium text-gray-700" dir="rtl">{deliverable.name_ar}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('deliverables.format')}</p>
              <p className="mt-1 text-sm text-gray-700">{deliverable.format || t('deliverables.notSpecified')}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('deliverables.plannedDate')}</p>
                <p className="mt-1 text-sm text-gray-700">{deliverable.planned_date ? formatDate(deliverable.planned_date) : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('deliverables.actualDate')}</p>
                <p className="mt-1 text-sm text-gray-700">{deliverable.actual_date ? formatDate(deliverable.actual_date) : '—'}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('deliverables.status')}</p>
              <StatusBadge status={deliverable.status as any} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('deliverables.totalSubmittals')}</h3>
            <p className="text-2xl font-bold text-gray-900">{sortedSubmittals.length}</p>
            {sortedSubmittals.length > 0 && sortedSubmittals[0].submitted_at && (
              <div className="pt-3 mt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{t('deliverables.latestSubmittal')}</p>
                <p className="text-sm text-gray-700">{formatDate(sortedSubmittals[0].submitted_at)}</p>
              </div>
            )}
          </div>

          {actions.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('deliverables.workflowActions')}</h3>
              <div className="space-y-3">
                {actions.map((action) => (
                  <div key={action.trigger}>
                    <button
                      onClick={() => handleAction(action.trigger)}
                      disabled={transition.isPending || action.needsDocs}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg transition-colors shadow-sm ${
                        action.needsDocs ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : action.color
                      } disabled:opacity-60`}
                      style={!action.needsDocs && action.trigger === 'consultant_submit' ? { backgroundColor: '#045859' } : {}}
                    >
                      {transition.isPending ? (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : action.icon}
                      {t(action.labelKey)}
                    </button>
                    <p className="mt-1 text-xs text-gray-500 flex items-start gap-1">
                      {action.needsDocs && <AlertCircle className="w-3 h-3 mt-0.5 text-amber-500 flex-shrink-0" />}
                      {t(action.descKey)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {user && (user.role === 'consultant' || user.role === 'admin') && (
            <button
              onClick={() => router.push(`/submittals/new?deliverable_id=${id}`)}
              className="w-full px-4 py-3 text-white font-medium rounded-lg transition-colors shadow-sm"
              style={{ backgroundColor: '#045859' }}
            >
              + {t('deliverables.newSubmittal')}
            </button>
          )}
        </div>
      </div>

      {/* Submittal History */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{t('deliverables.submittalHistory')}</h2>
          <p className="text-sm text-gray-600 mt-1">
            {sortedSubmittals.length === 0 ? t('deliverables.noSubmittals') : `${sortedSubmittals.length} ${t('deliverables.submittals')}`}
          </p>
        </div>

        {sortedSubmittals.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">{t('deliverables.noSubmittalsDesc')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {sortedSubmittals.map((submittal, index) => (
              <div key={submittal.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex gap-6">
                  <div className="flex flex-col items-center">
                    <div className="w-4 h-4 rounded-full border-4 border-white shadow-md" style={{ backgroundColor: '#045859' }}></div>
                    {index < sortedSubmittals.length - 1 && <div className="w-0.5 h-16 bg-gray-200 mt-2"></div>}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                      <div className="flex items-center gap-3">
                        <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                          {t('deliverables.version')} {submittal.version}
                        </span>
                        <span className="font-mono text-sm text-gray-600">{submittal.submittal_number}</span>
                        <StatusBadge status={submittal.status as any} />
                      </div>
                      <span className="text-sm text-gray-600">
                        {submittal.submitted_at ? formatDate(submittal.submitted_at) : t('deliverables.draft')}
                      </span>
                    </div>

                    {submittal.notes && (
                      <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">{t('submittal.notes')}</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{submittal.notes}</p>
                      </div>
                    )}

                    <div className="mt-3 flex gap-3">
                      {submittal.status === 'under_review' && user && (user.role === 'project_coordinator' || user.role === 'project_manager' || user.role === 'admin') && (
                        <button onClick={() => router.push(`/reviews/${submittal.id}`)} className="text-sm font-medium" style={{ color: '#045859' }}>
                          {t('review.title')} →
                        </button>
                      )}
                      {submittal.status === 'under_review' && user && (user.role === 'owner' || user.role === 'admin') && (
                        <button onClick={() => router.push(`/approvals/${submittal.id}`)} className="text-sm font-medium" style={{ color: '#87ba26' }}>
                          {t('approval.title')} →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
