'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Printer, Loader2, AlertTriangle } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useSubmittal } from '@/hooks/use-submittals'
import { useSupabase } from '@/hooks/use-supabase'
import { formatDate } from '@/lib/utils'
import type {
  Deliverable,
  SubmittalLineItem,
  ActionCode,
  Discipline,
} from '@/types/database'

// ═══════════════════════════════════════════════════════════════════
// Printable "Request for Approval of Deliverables" form
// ═══════════════════════════════════════════════════════════════════

// Row from v_workflow_chain view (04-workflow-v2 migration)
interface WorkflowChainRow {
  submittal_id: string
  submittal_stage: string | null
  request_type: 'study' | 'execution' | null
  technical_action_code: ActionCode | null
  technical_comments: string | null
  technical_comments_ar: string | null
  technical_reviewed_at: string | null
  technical_reviewer_name: string | null
  technical_reviewer_name_ar: string | null
  quality_action_code: ActionCode | null
  quality_comments: string | null
  quality_comments_ar: string | null
  quality_reviewed_at: string | null
  quality_reviewer_name: string | null
  quality_reviewer_name_ar: string | null
  pm_action_code: ActionCode | null
  pm_comments: string | null
  pm_comments_ar: string | null
  pm_reviewed_at: string | null
  pm_reviewer_name: string | null
  pm_reviewer_name_ar: string | null
  final_action_code: ActionCode | null
  final_comments: string | null
  final_decision_date: string | null
  final_approver_name: string | null
  final_approver_name_ar: string | null
}


export default function PrintSubmittalPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, isRTL } = useI18n()
  const supabase = useSupabase()

  const { data: submittal, isLoading: submittalLoading, error: submittalError } = useSubmittal(id)

  const [deliverable, setDeliverable] = useState<Deliverable | null>(null)
  const [lineItems, setLineItems] = useState<SubmittalLineItem[]>([])
  const [projectName, setProjectName] = useState<string>('')
  const [projectNameAr, setProjectNameAr] = useState<string>('')
  const [projectCode, setProjectCode] = useState<string>('')
  const [workflowChain, setWorkflowChain] = useState<WorkflowChainRow | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch deliverable + project + line items
  useEffect(() => {
    if (!submittal) return
    let cancelled = false

    async function loadRelated() {
      try {
        // Deliverable
        const { data: deliv } = await supabase
          .from('deliverables')
          .select('*')
          .eq('id', submittal!.deliverable_id)
          .single()

        if (cancelled) return
        setDeliverable(deliv as Deliverable)

        // Project via phase
        if (deliv?.phase_id) {
          const { data: phase } = await supabase
            .from('phases')
            .select('project_id')
            .eq('id', deliv.phase_id)
            .single()

          if (!cancelled && phase?.project_id) {
            const { data: project } = await supabase
              .from('projects')
              .select('code, name, name_ar')
              .eq('id', phase.project_id)
              .single()
            if (!cancelled && project) {
              setProjectName(project.name || '')
              setProjectNameAr(project.name_ar || '')
              setProjectCode(project.code || '')
            }
          }
        }

        // Line items
        const { data: items } = await supabase
          .from('submittal_line_items')
          .select('*')
          .eq('submittal_id', submittal!.id)
          .order('item_no', { ascending: true })

        if (!cancelled) setLineItems((items as SubmittalLineItem[]) || [])

        // Workflow chain (v2) — from v_workflow_chain view.
        // Gracefully fall back to null if the view is not present yet.
        try {
          const { data: chain } = await supabase
            .from('v_workflow_chain')
            .select('*')
            .eq('submittal_id', submittal!.id)
            .maybeSingle()
          if (!cancelled && chain) setWorkflowChain(chain as unknown as WorkflowChainRow)
        } catch (e) {
          console.warn('[print] workflow chain view not available', e)
        }
      } catch (e) {
        // Swallow — show whatever data we already have
        console.warn('[print] related data load error', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadRelated()
    return () => {
      cancelled = true
    }
  }, [submittal, supabase])

  // Auto-open browser print dialog if ?auto=1
  useEffect(() => {
    if (loading || submittalLoading) return undefined
    if (searchParams.get('auto') === '1' && typeof window !== 'undefined') {
      const timer = setTimeout(() => window.print(), 700)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [loading, submittalLoading, searchParams])

  const combinedLoading = submittalLoading || loading

  if (combinedLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 mx-auto animate-spin" style={{ color: '#045859' }} />
          <p className="mt-3 text-sm text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (submittalError || !submittal) {
    return (
      <div className="max-w-2xl mx-auto">
        <div
          className="rounded-lg p-6 border flex items-start gap-3"
          style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
        >
          <AlertTriangle className="w-6 h-6 flex-shrink-0" style={{ color: '#c05728' }} />
          <div>
            <h3 className="font-semibold" style={{ color: '#991b1b' }}>
              {isRTL ? 'تعذّر تحميل التقديم' : 'Could not load submittal'}
            </h3>
            <p className="text-sm mt-1" style={{ color: '#991b1b' }}>
              {submittalError?.message || (isRTL ? 'المعرف غير صالح' : 'Invalid submittal id')}
            </p>
            <button
              onClick={() => router.back()}
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium"
              style={{ color: '#045859' }}
            >
              <ArrowLeft className="w-4 h-4" />
              {t('common.back') || 'Back'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const allDisciplines: Discipline[] =
    submittal.disciplines && submittal.disciplines.length > 0
      ? submittal.disciplines
      : submittal.discipline
      ? [submittal.discipline]
      : []

  return (
    <div>
      {/* ─────── Floating action bar (screen only) ─────── */}
      <div className="no-print sticky top-0 z-40 bg-white border-b border-gray-200 mb-4">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('common.back') || 'Back'}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm hover:shadow-md transition-all"
              style={{ backgroundColor: '#045859' }}
            >
              <Printer className="w-4 h-4" />
              {t('approvalForm.printForm')}
            </button>
          </div>
        </div>
      </div>

      {/* ─────── Printable document ─────── */}
      <div
        className="print-document bg-white mx-auto shadow-sm border border-gray-200 print:border-0 print:shadow-none"
        style={{ maxWidth: '210mm', padding: '14mm 14mm 16mm 14mm' }}
      >
        {/* Letterhead */}
        <div
          className="print-section flex items-start justify-between pb-4 border-b-2"
          style={{ borderColor: '#045859' }}
        >
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/momah-logo-horizontal.png"
              alt="MOMAH"
              style={{ height: '56px', width: 'auto', objectFit: 'contain' }}
            />
          </div>
          <div className="text-end">
            <div
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: '#54565b' }}
            >
              Ministry of Municipalities and Housing
            </div>
            <div className="text-[10px]" style={{ color: '#54565b' }} dir="rtl">
              وزارة الشؤون البلدية والقروية والإسكان
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="print-section text-center py-5">
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: '#87ba26' }}
          >
            Official Form
          </div>
          <h1 className="text-xl font-bold mt-1" style={{ color: '#045859' }}>
            {t('approvalForm.pageTitle')}
          </h1>
          <h2 className="text-lg font-bold mt-0.5" style={{ color: '#045859' }} dir="rtl">
            {t('approvalForm.pageTitleAr')}
          </h2>
        </div>

        {/* ─── Section A: Header Information ─── */}
        <Section letter="A" title={t('approvalForm.sectionHeader')}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <FormRow
              label={t('approvalForm.projectCode')}
              value={projectCode || '—'}
            />
            <FormRow
              label={t('approvalForm.submittalNumber')}
              value={submittal.submittal_number}
              mono
            />
            <FormRow
              label={t('approvalForm.projectName')}
              value={isRTL ? projectNameAr || projectName : projectName || projectNameAr}
              wide
            />
            <FormRow
              label={t('approvalForm.version')}
              value={`v${submittal.version}`}
            />
            <FormRow
              label={t('approvalForm.deliverable')}
              value={
                deliverable
                  ? `${deliverable.code} — ${isRTL ? deliverable.name_ar : deliverable.name}`
                  : '—'
              }
              wide
            />
            <FormRow
              label={t('approvalForm.submittalDate')}
              value={
                submittal.submitted_at
                  ? formatDate(submittal.submitted_at)
                  : formatDate(submittal.created_at)
              }
            />
            <FormRow
              label={t('approvalForm.previousSubmittalDate')}
              value={
                submittal.previous_submittal_date
                  ? formatDate(submittal.previous_submittal_date)
                  : '—'
              }
            />
          </div>
        </Section>

        {/* ─── Section B: Purpose ─── */}
        <Section letter="B" title={t('approvalForm.sectionPurpose')}>
          <div className="flex flex-wrap gap-6 text-xs">
            <PurposeBox
              label={t('submittal.forApproval')}
              checked={submittal.purpose === 'for_approval'}
            />
            <PurposeBox
              label={t('submittal.forFollowUp')}
              checked={submittal.purpose === 'for_follow_up'}
            />
            <PurposeBox
              label={t('submittal.forInformation')}
              checked={submittal.purpose === 'for_information'}
            />
            {submittal.purpose === 'for_tendering' && (
              <PurposeBox
                label={t('submittal.forTendering')}
                checked
              />
            )}
          </div>
        </Section>

        {/* ─── Section B2: Request Type ─── */}
        <Section letter="B2" title={t('requestType.label')}>
          <div className="flex flex-wrap gap-6 text-xs">
            <PurposeBox
              label={t('requestType.study')}
              checked={submittal.request_type === 'study'}
            />
            <PurposeBox
              label={t('requestType.execution')}
              checked={submittal.request_type === 'execution'}
            />
          </div>
        </Section>

        {/* ─── Section C: Disciplines ─── */}
        <Section letter="C" title={t('approvalForm.sectionDisciplines')}>
          {allDisciplines.length === 0 ? (
            <p className="text-xs text-gray-500">—</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allDisciplines.map((d) => (
                <span
                  key={d}
                  className="inline-block px-3 py-1 text-[11px] font-semibold rounded border"
                  style={{
                    backgroundColor: '#e6f2f2',
                    color: '#045859',
                    borderColor: '#045859',
                  }}
                >
                  {t(`disciplines.${d}`) || d}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* ─── Section D: Line Items Grid ─── */}
        <Section letter="D" title={t('approvalForm.sectionLineItems')}>
          {lineItems.length === 0 ? (
            <p className="text-xs text-gray-500">{t('approvalForm.noLineItems')}</p>
          ) : (
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr style={{ backgroundColor: '#e6f2f2' }}>
                  <GridTh width="5%">{t('approvalForm.itemNo')}</GridTh>
                  <GridTh width="30%">{t('approvalForm.outputName')}</GridTh>
                  <GridTh width="13%">{t('approvalForm.drawingNumber')}</GridTh>
                  <GridTh width="10%">{t('approvalForm.format')}</GridTh>
                  <GridTh width="10%">{t('approvalForm.revisionNumber')}</GridTh>
                  <GridTh width="22%">{t('approvalForm.description')}</GridTh>
                  <GridTh width="10%">{t('approvalForm.actionCode')}</GridTh>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={item.id}>
                    <GridTd center>{item.item_no}</GridTd>
                    <GridTd>
                      {isRTL
                        ? item.output_name_ar || item.output_name
                        : item.output_name || item.output_name_ar}
                    </GridTd>
                    <GridTd mono>{item.drawing_number || '—'}</GridTd>
                    <GridTd>{item.format || '—'}</GridTd>
                    <GridTd mono center>
                      {item.revision_number || '—'}
                    </GridTd>
                    <GridTd>
                      {isRTL
                        ? item.description_ar || item.description || '—'
                        : item.description || item.description_ar || '—'}
                    </GridTd>
                    <GridTd center>
                      <ActionCodeCell code={item.action_code} />
                    </GridTd>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ─── Section E: Notes (submitter-authored) ─── */}
        <Section letter="E" title={t('approvalForm.sectionNotes')}>
          <div className="text-xs space-y-3">
            <div>
              <div className="text-[10px] font-semibold uppercase text-gray-500 mb-1">
                {t('approvalForm.sectionNotes')}
              </div>
              <div
                className="min-h-[60px] p-2 border border-gray-300 rounded text-[11px] leading-relaxed whitespace-pre-wrap"
                style={{ backgroundColor: '#fafafa' }}
              >
                {(isRTL ? submittal.notes_ar : submittal.notes) || (
                  <span className="text-gray-400">—</span>
                )}
              </div>
            </div>
          </div>
        </Section>

        {/* ─── Attachments (if present) ─── */}
        {(submittal.file_url || submittal.file_attachment_path) && (
          <Section letter="" title={t('approvalForm.fileUpload')}>
            <div className="text-xs space-y-2">
              {submittal.file_attachment_path && (
                <div className="flex items-center gap-2 p-2 border border-gray-200 rounded" style={{ backgroundColor: '#fafafa' }}>
                  <span className="text-[10px] font-semibold text-gray-500">{isRTL ? 'ملف مرفق:' : 'Attached File:'}</span>
                  <span className="text-[11px] text-gray-800 font-mono">
                    {submittal.file_attachment_path.split('/').pop() || submittal.file_attachment_path}
                  </span>
                </div>
              )}
              {submittal.file_url && (
                <div className="flex items-center gap-2 p-2 border border-gray-200 rounded" style={{ backgroundColor: '#fafafa' }}>
                  <span className="text-[10px] font-semibold text-gray-500">{isRTL ? 'رابط خارجي:' : 'External Link:'}</span>
                  <span className="text-[11px] text-gray-800 break-all" dir="ltr">{submittal.file_url}</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ─── Section F: Specialized Consultant ─── */}
        <Section letter="F" title={t('approvalForm.sectionSpecializedConsultant')}>
          <div className="text-xs">
            <div className="text-[10px] font-semibold uppercase text-gray-500 mb-1">
              {t('approvalForm.specializedRemarks')}
            </div>
            <div
              className="min-h-[50px] p-2 border border-gray-300 rounded text-[11px] leading-relaxed"
              style={{ backgroundColor: '#fafafa' }}
            >
              <span className="text-gray-400">—</span>
            </div>
            <div className="grid grid-cols-2 gap-6 mt-3">
              <SignatureSlot
                label={t('approvalForm.specializedName')}
                subLabel={t('approvalForm.specializedActionCode')}
              />
              <SignatureSlot
                label={isRTL ? 'التاريخ' : 'Date'}
                subLabel={isRTL ? 'التوقيع' : 'Sign'}
              />
            </div>
          </div>
        </Section>

        {/* ─── Section G: Workflow Chain (Technical → Quality → PM → Final) ─── */}
        <Section letter="G" title={t('workflow.timelineTitle')}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <StageColumn
              title={t('workflow.stageTechnical')}
              actionCode={workflowChain?.technical_action_code ?? null}
              reviewerName={
                isRTL
                  ? workflowChain?.technical_reviewer_name_ar || workflowChain?.technical_reviewer_name || ''
                  : workflowChain?.technical_reviewer_name || ''
              }
              reviewedAt={workflowChain?.technical_reviewed_at ?? null}
              comments={
                isRTL
                  ? workflowChain?.technical_comments_ar || workflowChain?.technical_comments || ''
                  : workflowChain?.technical_comments || ''
              }
              isRTL={isRTL}
            />
            <StageColumn
              title={t('workflow.stageQuality')}
              actionCode={workflowChain?.quality_action_code ?? null}
              reviewerName={
                isRTL
                  ? workflowChain?.quality_reviewer_name_ar || workflowChain?.quality_reviewer_name || ''
                  : workflowChain?.quality_reviewer_name || ''
              }
              reviewedAt={workflowChain?.quality_reviewed_at ?? null}
              comments={
                isRTL
                  ? workflowChain?.quality_comments_ar || workflowChain?.quality_comments || ''
                  : workflowChain?.quality_comments || ''
              }
              isRTL={isRTL}
            />
            <StageColumn
              title={t('workflow.stagePM')}
              actionCode={workflowChain?.pm_action_code ?? null}
              reviewerName={
                isRTL
                  ? workflowChain?.pm_reviewer_name_ar || workflowChain?.pm_reviewer_name || ''
                  : workflowChain?.pm_reviewer_name || ''
              }
              reviewedAt={workflowChain?.pm_reviewed_at ?? null}
              comments={
                isRTL
                  ? workflowChain?.pm_comments_ar || workflowChain?.pm_comments || ''
                  : workflowChain?.pm_comments || ''
              }
              isRTL={isRTL}
            />
            <StageColumn
              title={t('workflow.stageFinal')}
              actionCode={workflowChain?.final_action_code ?? null}
              reviewerName={
                isRTL
                  ? workflowChain?.final_approver_name_ar || workflowChain?.final_approver_name || ''
                  : workflowChain?.final_approver_name || ''
              }
              reviewedAt={workflowChain?.final_decision_date ?? null}
              comments={workflowChain?.final_comments || ''}
              isRTL={isRTL}
              finalStage
            />
          </div>
        </Section>

        {/* ─── Section H: Action Codes Legend ─── */}
        <Section letter="H" title={t('approvalForm.sectionActionCodes')}>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <LegendRow code="A" color="#22c55e" label={t('approvalForm.actionA')} />
            <LegendRow code="B" color="#87ba26" label={t('approvalForm.actionB')} />
            <LegendRow code="C" color="#FFC845" label={t('approvalForm.actionC')} />
            <LegendRow code="D" color="#c05728" label={t('approvalForm.actionD')} />
          </div>
        </Section>

        {/* Footer */}
        <div
          className="mt-6 pt-3 border-t text-[9px] flex items-center justify-between"
          style={{ borderColor: '#e5e7eb', color: '#54565b' }}
        >
          <div>
            {isRTL ? 'نظام حوكمة المخرجات الهندسية' : 'Engineering Deliverables Governance System'}
          </div>
          <div className="font-mono">
            {submittal.submittal_number} · v{submittal.version}
          </div>
          <div>
            {isRTL ? 'طُبع في' : 'Printed'} {formatDate(new Date().toISOString())}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════

function Section({
  letter,
  title,
  children,
}: {
  letter: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="print-section mt-5">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-bold text-white"
          style={{ backgroundColor: '#045859' }}
        >
          {letter}
        </span>
        <h3 className="text-[13px] font-bold" style={{ color: '#045859' }}>
          {title}
        </h3>
        <span className="flex-1 h-px" style={{ backgroundColor: '#e6f2f2' }} />
      </div>
      <div className="ps-8">{children}</div>
    </section>
  )
}

function FormRow({
  label,
  value,
  wide,
  mono,
}: {
  label: string
  value: string
  wide?: boolean
  mono?: boolean
}) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[9px] font-semibold uppercase text-gray-500">{label}</div>
      <div
        className={`mt-0.5 pb-0.5 border-b border-gray-300 text-[11px] ${
          mono ? 'font-mono' : ''
        }`}
        style={{ color: '#1f2937' }}
      >
        {value || '—'}
      </div>
    </div>
  )
}

function PurposeBox({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-center justify-center w-4 h-4 border-2 rounded"
        style={{
          borderColor: checked ? '#045859' : '#94a3b8',
          backgroundColor: checked ? '#045859' : 'white',
        }}
      >
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3 h-3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className="text-[11px] font-medium text-gray-700">{label}</span>
    </div>
  )
}

function GridTh({ children, width }: { children: React.ReactNode; width?: string }) {
  return (
    <th
      className="border border-gray-400 px-1.5 py-1 text-[9px] font-bold uppercase text-start"
      style={{ width, color: '#045859' }}
    >
      {children}
    </th>
  )
}

function GridTd({
  children,
  center,
  mono,
}: {
  children: React.ReactNode
  center?: boolean
  mono?: boolean
}) {
  return (
    <td
      className={`border border-gray-300 px-1.5 py-1 text-[10px] align-top ${
        center ? 'text-center' : ''
      } ${mono ? 'font-mono' : ''}`}
    >
      {children}
    </td>
  )
}

const ACTION_COLORS: Record<ActionCode, string> = {
  A: '#22c55e',
  B: '#87ba26',
  C: '#FFC845',
  D: '#c05728',
}

function ActionCodeCell({ code }: { code: ActionCode | null }) {
  if (!code) return <span className="text-gray-300">—</span>
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: ACTION_COLORS[code] }}
    >
      {code}
    </span>
  )
}

function SignatureSlot({ label, subLabel }: { label: string; subLabel: string }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase text-gray-500">{label}</div>
      <div className="h-10 border-b border-gray-400" />
      <div className="text-[9px] text-gray-500 mt-0.5">{subLabel}</div>
    </div>
  )
}

function StageColumn({
  title,
  actionCode,
  reviewerName,
  reviewedAt,
  comments,
  isRTL,
  finalStage = false,
}: {
  title: string
  actionCode: ActionCode | null
  reviewerName: string
  reviewedAt: string | null
  comments: string
  isRTL: boolean
  finalStage?: boolean
}) {
  const hasDecision = actionCode !== null || reviewerName || reviewedAt
  return (
    <div
      className="border rounded p-2"
      style={{
        borderColor: finalStage && actionCode ? '#87ba26' : '#045859',
        backgroundColor: finalStage && actionCode ? '#f3faea' : '#fafafa',
      }}
    >
      <div
        className="flex items-center justify-between pb-1 mb-2 border-b"
        style={{ borderColor: '#e6f2f2' }}
      >
        <div
          className="text-[10px] font-bold uppercase"
          style={{ color: '#045859' }}
        >
          {title}
        </div>
        {actionCode && (
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: ACTION_COLORS[actionCode] }}
          >
            {actionCode}
          </span>
        )}
      </div>
      {hasDecision ? (
        <div className="space-y-1.5">
          <div>
            <div className="text-[9px] font-semibold uppercase text-gray-500">
              {isRTL ? 'المراجع' : 'Reviewer'}
            </div>
            <div className="text-[10px]" style={{ color: '#1f2937' }}>
              {reviewerName || '—'}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase text-gray-500">
              {isRTL ? 'التاريخ' : 'Date'}
            </div>
            <div className="text-[10px]" style={{ color: '#1f2937' }}>
              {reviewedAt ? formatDate(reviewedAt) : '—'}
            </div>
          </div>
          {comments && (
            <div>
              <div className="text-[9px] font-semibold uppercase text-gray-500">
                {isRTL ? 'ملاحظات' : 'Comments'}
              </div>
              <div
                className="text-[10px] leading-snug"
                style={{ color: '#1f2937' }}
              >
                {comments}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-[9px] font-semibold uppercase text-gray-500">
              {isRTL ? 'المراجع' : 'Reviewer'}
            </div>
            <div className="h-5 border-b border-gray-300" />
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase text-gray-500">
              {isRTL ? 'التوقيع' : 'Signature'}
            </div>
            <div className="h-8 border-b border-gray-300" />
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase text-gray-500">
              {isRTL ? 'التاريخ' : 'Date'}
            </div>
            <div className="h-5 border-b border-gray-300" />
          </div>
        </div>
      )}
    </div>
  )
}

function LegendRow({ code, color, label }: { code: string; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full font-bold text-white text-[10px]"
        style={{ backgroundColor: color }}
      >
        {code}
      </span>
      <span className="text-[10px] text-gray-700">{label}</span>
    </div>
  )
}
