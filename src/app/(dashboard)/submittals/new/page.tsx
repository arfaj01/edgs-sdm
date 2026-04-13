'use client'

/**
 * Request for Approval of Deliverables — Digital Form
 *
 * Replaces the old minimal submittal form with the full 8-section
 * approval form mirroring the official ministry Excel template:
 *   A. Header / project metadata (auto-populated)
 *   B. Submittal purpose (radio)
 *   C. Disciplines involved (multi-select)
 *   D. Line items grid (dynamic rows)
 *   E. Consultant section (auto-populated + remarks)
 *   F. Specialized consultant section (optional)
 *   G. Owner / internal approval section (read-only until workflow)
 *   H. Action codes reference
 *
 * Workflow integration:
 *   - "Save Draft"  → create-submittal edge function (status=draft)
 *   - "Submit"      → create-submittal then workflow-transition(consultant_submit)
 *   - Line items & new columns are persisted directly through the
 *     Supabase client after the base submittal exists.
 */

import { Suspense, useMemo, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { StepIndicator } from '@/components/ui/step-indicator'
import { useI18n } from '@/lib/i18n'
import { useDeliverables, useUser, useCreateSubmittal, useWorkflowTransition } from '@/hooks'
import { useSupabase } from '@/hooks/use-supabase'
import { cn } from '@/lib/utils'
import type {
  SubmittalPurpose,
  Discipline,
  DeliverableFormat,
  RequestType,
  UserRole,
} from '@/types/database'

// Role gating for the new-submittal form.
// Submitter-side roles see only A–E (E relabeled as Notes). Approval-side
// roles additionally see F (specialized consultant reference), G (owner
// decisions), and H (action-code legend).
const SUBMITTER_ROLES: UserRole[] = ['submitter', 'consultant']
const APPROVAL_ROLES: UserRole[] = [
  'technical_unit',
  'quality_unit',
  'project_manager',
  'department_director',
  'admin',
  'owner',
  'project_coordinator',
]
import { AlertCircle, Plus, Trash2, FileText, Save, Send, CheckCircle2, Loader2, Link2 } from 'lucide-react'
import { FileUpload } from '@/components/ui/file-upload'
import type { UploadedFile } from '@/components/ui/file-upload'

// ─────────────────────────────────────────────────────────────
// Constants / option lists
// ─────────────────────────────────────────────────────────────

const ALL_DISCIPLINES: Discipline[] = [
  'architectural',
  'structural',
  'civil',
  'mechanical',
  'hvac',
  'plumbing',
  'electrical',
  'reports',
]

const ALL_FORMATS: DeliverableFormat[] = [
  'PDF',
  'DWG',
  'RVT',
  'XLS',
  'PPTX',
  'DOC',
  'IFC',
  'MIXED',
]

// Canonical purpose options for all new submissions. 'for_tendering' is kept
// as a legacy value in the type but is no longer offered here.
const SUBMITTAL_PURPOSES: { value: SubmittalPurpose; labelKey: string }[] = [
  { value: 'for_follow_up', labelKey: 'submittal.forFollowUp' },
  { value: 'for_approval', labelKey: 'submittal.forApproval' },
  { value: 'for_information', labelKey: 'submittal.forInformation' },
]

const REQUEST_TYPES: { value: RequestType; labelKey: string; descKey: string }[] = [
  { value: 'study', labelKey: 'requestType.study', descKey: 'requestType.studyDesc' },
  { value: 'execution', labelKey: 'requestType.execution', descKey: 'requestType.executionDesc' },
]

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface LineItemDraft {
  clientId: string // local only (not persisted)
  item_no: number
  output_name: string
  output_name_ar: string
  drawing_number: string
  format: DeliverableFormat | ''
  revision_number: string
  description: string
  description_ar: string
}

// ─────────────────────────────────────────────────────────────
// Page wrapper
// ─────────────────────────────────────────────────────────────

export default function NewSubmittalPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-gray-500">...</div>
      }
    >
      <ApprovalFormPage />
    </Suspense>
  )
}

// ─────────────────────────────────────────────────────────────
// Main form
// ─────────────────────────────────────────────────────────────

function ApprovalFormPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, isRTL } = useI18n()
  const supabase = useSupabase()
  const { user } = useUser()
  const { data: deliverables } = useDeliverables()
  const createSubmittal = useCreateSubmittal()
  const transition = useWorkflowTransition()

  // ── state ───────────────────────────────────────────────
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string>(
    searchParams.get('deliverable_id') || ''
  )
  const [purpose, setPurpose] = useState<SubmittalPurpose | ''>('')
  const [requestType, setRequestType] = useState<RequestType>('study')
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [notes, setNotes] = useState('')
  const [notesAr, setNotesAr] = useState('')
  const [specializedName, setSpecializedName] = useState('')
  const [specializedRemarks, setSpecializedRemarks] = useState('')
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([])
  const [fileUrl, setFileUrl] = useState('')
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitMode, setSubmitMode] = useState<'draft' | 'submit' | null>(null)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [transitionInfo, setTransitionInfo] = useState<{ stage?: string | null; assignee?: string | null } | null>(null)

  // Unwrap any error shape the Supabase client might return. The JS client
  // wraps Edge Function failures in a FunctionsHttpError whose message is
  // "Edge Function returned a non-2xx status code" — the actual message
  // lives on `error.context.body` or the response body itself. We also
  // fall back through plain Error, string, and structured objects.
  const extractErrorMessage = async (err: unknown): Promise<string> => {
    if (!err) return t('approvalForm.createError')
    // Supabase FunctionsHttpError carries a Response in `context`
    const anyErr = err as { context?: Response; message?: string }
    if (anyErr?.context && typeof anyErr.context === 'object' && 'json' in anyErr.context) {
      try {
        const body = await (anyErr.context as Response).clone().json()
        if (body?.error) return String(body.error)
        if (body?.message) return String(body.message)
      } catch {
        try {
          const txt = await (anyErr.context as Response).clone().text()
          if (txt) return txt
        } catch { /* ignore */ }
      }
    }
    if (err instanceof Error) return err.message
    if (typeof err === 'string') return err
    try { return JSON.stringify(err) } catch { return String(err) }
  }

  // ── derived ─────────────────────────────────────────────
  const selectedDeliverable = useMemo(
    () => deliverables?.find((d) => d.deliverable_id === selectedDeliverableId),
    [deliverables, selectedDeliverableId]
  )

  // Role-based visibility. Submitters only see A–E during the initial
  // submission stage; approval-side roles (Technical/Quality/PM/Admin/
  // Director/Owner/Project Coordinator) additionally see sections F–H.
  // This is a UI-level gate only — RLS and workflow triggers remain
  // the authoritative enforcement layer on the server.
  const currentRole = user?.role as UserRole | undefined
  const isApprovalRole =
    !!currentRole && APPROVAL_ROLES.includes(currentRole)
  const isSubmitterRole =
    !currentRole || SUBMITTER_ROLES.includes(currentRole)
  // Submitter-only users never see approval-side sections on the
  // initial submission form. Approval roles (admin/director/TU/QU/PM)
  // still see everything so they can review while creating a record
  // on behalf of a submitter during the pilot.
  const showApprovalSections = isApprovalRole && !isSubmitterRole

  // Auto-select primary discipline when deliverable changes
  useEffect(() => {
    if (selectedDeliverable?.discipline && disciplines.length === 0) {
      setDisciplines([selectedDeliverable.discipline])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeliverableId])

  // ── helpers ─────────────────────────────────────────────
  const toggleDiscipline = (d: Discipline) => {
    setDisciplines((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    )
  }

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        clientId: `li-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        item_no: prev.length + 1,
        output_name: selectedDeliverable?.name || '',
        output_name_ar: selectedDeliverable?.name_ar || '',
        drawing_number: '',
        format: (selectedDeliverable?.format as DeliverableFormat) || '',
        revision_number: '',
        description: '',
        description_ar: '',
      },
    ])
  }

  const updateLineItem = (
    clientId: string,
    field: keyof LineItemDraft,
    value: string
  ) => {
    setLineItems((prev) =>
      prev.map((li) => (li.clientId === clientId ? { ...li, [field]: value } : li))
    )
  }

  const removeLineItem = (clientId: string) => {
    setLineItems((prev) =>
      prev
        .filter((li) => li.clientId !== clientId)
        .map((li, idx) => ({ ...li, item_no: idx + 1 }))
    )
  }

  // ── validation ──────────────────────────────────────────
  const validate = (): boolean => {
    const errs: string[] = []
    if (!selectedDeliverableId) errs.push(t('submittal.deliverableRequired'))
    if (!purpose) errs.push(t('submittal.purposeRequired'))
    if (disciplines.length === 0) errs.push(t('approvalForm.atLeastOneDiscipline'))
    if (lineItems.length === 0) errs.push(t('approvalForm.atLeastOneLineItem'))
    lineItems.forEach((li, i) => {
      if (!li.output_name.trim())
        errs.push(
          `${t('approvalForm.itemNo')}${i + 1}: ${t('approvalForm.outputName')} ${t('common.required')}`
        )
    })
    setErrors(errs)
    return errs.length === 0
  }

  // ── persist line items / extended columns ──────────────
  const persistExtended = async (submittalId: string) => {
    // 1) Update disciplines[] and consultant fields on submittals row
    const { error: updErr } = await supabase
      .from('submittals')
      .update({
        disciplines,
        notes: notes || null,
        notes_ar: notesAr || null,
        request_type: requestType,
        file_url: fileUrl || null,
        file_attachment_path: uploadedFile?.path || null,
      })
      .eq('id', submittalId)
    if (updErr) {
      // Non-fatal if the columns don't exist yet — surface but don't crash
      console.warn('Extended-column update failed (migration may not be applied):', updErr)
    }

    // 2) Insert line items
    if (lineItems.length > 0) {
      const rows = lineItems.map((li) => ({
        submittal_id: submittalId,
        item_no: li.item_no,
        output_name: li.output_name,
        output_name_ar: li.output_name_ar || null,
        drawing_number: li.drawing_number || null,
        format: li.format || null,
        revision_number: li.revision_number || null,
        description: li.description || null,
        description_ar: li.description_ar || null,
      }))
      const { error: liErr } = await supabase.from('submittal_line_items').insert(rows)
      if (liErr) {
        console.warn('Line-item insert failed (migration may not be applied):', liErr)
      }
    }
  }

  // ── submit handlers ─────────────────────────────────────
  const handleSave = async (submit: boolean) => {
    /* ── DEBUG ── */ console.log('[EDGS-FRONT:new-submittal] handleSave called — submit:', submit)

    if (!validate()) {
      /* ── DEBUG ── */ console.warn('[EDGS-FRONT:new-submittal] Validation failed, aborting')
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
      return
    }
    setIsSubmitting(true)
    setSubmitMode(submit ? 'submit' : 'draft')
    setErrors([])

    try {
      /* ── DEBUG ── */ console.log('[EDGS-FRONT:new-submittal] Step 1: Calling create-submittal edge function…')
      const resp = await createSubmittal.mutateAsync({
        deliverable_id: selectedDeliverableId,
        purpose: purpose as SubmittalPurpose,
        notes: notes || undefined,
      })
      /* ── DEBUG ── */ console.log('[EDGS-FRONT:new-submittal] Step 1 done — create response:', JSON.stringify(resp))

      if (!resp?.id) {
        throw new Error('create-submittal returned no id')
      }

      // Persist extended columns (disciplines, notes_ar, request_type)
      // and line items. These calls hit the database directly through
      // the user-context Supabase client, so RLS applies.
      /* ── DEBUG ── */ console.log('[EDGS-FRONT:new-submittal] Step 2: Persisting extended columns for', resp.id)
      await persistExtended(resp.id)
      /* ── DEBUG ── */ console.log('[EDGS-FRONT:new-submittal] Step 2 done — persistExtended completed')

      if (submit) {
        /* ── DEBUG ── */ console.log('[EDGS-FRONT:new-submittal] Step 3: submit=true → Calling workflow-transition edge function…')
        const transitionPayload = {
          submittal_id: resp.id,
          trigger_name: 'consultant_submit' as const,
        }
        /* ── DEBUG ── */ console.log('[EDGS-FRONT:new-submittal] Transition payload:', JSON.stringify(transitionPayload))

        try {
          const transResult = await transition.mutateAsync(transitionPayload)
          /* ── DEBUG ── */ console.log('[EDGS-FRONT:new-submittal] Step 3 done — transition response:', JSON.stringify(transResult))

          // Store stage/assignee info for the success page
          if (transResult) {
            setTransitionInfo({
              stage: transResult.new_stage,
              assignee: transResult.assigned_to,
            })
          }
        } catch (e) {
          // Transition failed — the submittal exists as draft but was NOT
          // submitted for review. Surface a clear error so the user knows
          // they need to retry or check the request status.
          /* ── DEBUG ── */ console.error('[EDGS-FRONT:new-submittal] Step 3 FAILED — transition error:', e)
          /* ── DEBUG ── */ console.error('[EDGS-FRONT:new-submittal] Error type:', typeof e, '| constructor:', (e as Error)?.constructor?.name)
          /* ── DEBUG ── */ console.error('[EDGS-FRONT:new-submittal] Error message:', (e as Error)?.message)

          const transitionMsg = await extractErrorMessage(e)
          /* ── DEBUG ── */ console.error('[EDGS-FRONT:new-submittal] Extracted message:', transitionMsg)

          setErrors([
            `${t('approvalForm.transitionError') || 'فشل إرسال الطلب للمراجعة'}: ${transitionMsg}`,
          ])
          // Scroll error into view so user sees what happened
          requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' })
          })
          // Do NOT show success page — the request is still in Draft
          return
        }
      } else {
        /* ── DEBUG ── */ console.log('[EDGS-FRONT:new-submittal] Step 3: submit=false → Skipping transition (save as draft only)')
      }

      /* ── DEBUG ── */ console.log('[EDGS-FRONT:new-submittal] Step 4: All done — showing success for submittal', resp.id)
      setSuccessId(resp.id)
      // Longer pause so the user can choose Print or View;
      // a fallback redirect happens after 8 seconds of inactivity.
      setTimeout(() => {
        router.push(`/deliverables/${selectedDeliverableId}`)
      }, 8000)
    } catch (e: unknown) {
      /* ── DEBUG ── */ console.error('[EDGS-FRONT:new-submittal] OUTER catch — submit failed:', e)
      const msg = await extractErrorMessage(e)
      setErrors([msg])
      // Scroll error into view
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
    } finally {
      setIsSubmitting(false)
      setSubmitMode(null)
    }
  }

  // ── display ─────────────────────────────────────────────
  if (successId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-10 max-w-md text-center">
          <CheckCircle2 className="w-14 h-14 mx-auto mb-4" style={{ color: '#045859' }} />
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {t('approvalForm.createSuccess')}
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            {t('approvalForm.submittalNumber')}
          </p>

          {/* Show next stage and assignee after successful submission */}
          {transitionInfo && (
            <div className="mb-6 p-4 rounded-lg border text-sm" style={{ backgroundColor: '#f0faf5', borderColor: '#c6e9d7' }}>
              {transitionInfo.stage && (
                <p className="font-medium" style={{ color: '#045859' }}>
                  {t('approvalForm.nextStage') || (isRTL ? 'المرحلة التالية' : 'Next Stage')}:{' '}
                  <span className="font-bold">
                    {transitionInfo.stage === 'technical'
                      ? (isRTL ? 'الجهة الفنية' : 'Technical Review')
                      : transitionInfo.stage === 'quality'
                      ? (isRTL ? 'الجودة' : 'Quality Review')
                      : transitionInfo.stage === 'pm'
                      ? (isRTL ? 'مدير المشروع' : 'Project Manager')
                      : transitionInfo.stage}
                  </span>
                </p>
              )}
              {transitionInfo.assignee && (
                <p className="mt-1 text-gray-700">
                  {t('approvalForm.assignedTo') || (isRTL ? 'مُسند إلى' : 'Assigned to')}:{' '}
                  <span className="font-semibold">{transitionInfo.assignee}</span>
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push(`/submittals/${successId}/print`)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm"
              style={{ backgroundColor: '#045859' }}
            >
              <FileText className="w-4 h-4" />
              {t('approvalForm.printForm')}
            </button>
            <button
              onClick={() => router.push(`/deliverables/${selectedDeliverableId}`)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border"
              style={{ borderColor: '#045859', color: '#045859' }}
            >
              {t('common.back') || 'Back'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('approvalForm.pageTitle')}
        titleAr={t('approvalForm.pageTitleAr')}
        description={t('approvalForm.pageDescription')}
      />

      {/* Step indicator — A through E (mandatory sections). F-H are reviewer-only. */}
      <StepIndicator
        steps={[
          { letter: 'A', labelKey: 'approvalForm.stepHeader', active: !selectedDeliverableId, completed: !!selectedDeliverableId },
          { letter: 'B', labelKey: 'approvalForm.stepPurpose', active: !!selectedDeliverableId && !purpose, completed: !!selectedDeliverableId && !!purpose },
          { letter: 'C', labelKey: 'approvalForm.stepDisciplines', active: !!purpose && disciplines.length === 0, completed: !!purpose && disciplines.length > 0 },
          { letter: 'D', labelKey: 'approvalForm.stepLineItems', active: disciplines.length > 0 && lineItems.length === 0, completed: lineItems.length > 0 },
          { letter: 'E', labelKey: 'approvalForm.stepNotes', active: lineItems.length > 0, completed: false },
        ]}
      />

      {/* Errors — prominent, dismissible, always visible at top of form */}
      {errors.length > 0 && (
        <div
          className="p-4 bg-red-50 border-2 border-red-300 rounded-lg shadow-sm"
          role="alert"
          aria-live="assertive"
          data-testid="submit-error-banner"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 mb-2">
                {t('submittal.fixErrors')}
              </h3>
              <ul className="space-y-1 text-sm text-red-800">
                {errors.map((e, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-red-600 mt-1">•</span>
                    <span className="break-words">{e}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setErrors([])}
              className="text-red-600 hover:text-red-800 text-sm font-medium"
              aria-label="Dismiss errors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ─────────────── SECTION A: Header ─────────────── */}
      <FormSection
        letter="A"
        title={t('approvalForm.sectionHeader')}
        hint={t('approvalForm.sectionHeaderHint')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ReadOnlyField
            label={t('approvalForm.projectName')}
            value={
              isRTL
                ? selectedDeliverable?.project_name || '—'
                : selectedDeliverable?.project_name || '—'
            }
          />
          <ReadOnlyField
            label={t('approvalForm.projectCode')}
            value={selectedDeliverable?.project_code || '—'}
          />
          <ReadOnlyField
            label={t('approvalForm.submittalNumber')}
            value={t('approvalForm.autoGenerated')}
          />
          <ReadOnlyField
            label={t('approvalForm.submittalDate')}
            value={new Date().toISOString().slice(0, 10)}
          />
        </div>

        {/* Deliverable selector */}
        <div className="mt-5">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            {t('approvalForm.deliverable')} <span className="text-red-600">*</span>
          </label>
          <select
            value={selectedDeliverableId}
            onChange={(e) => setSelectedDeliverableId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent text-base"
            style={{ ['--tw-ring-color' as string]: '#045859' }}
          >
            <option value="">{t('approvalForm.selectDeliverable')}</option>
            {deliverables?.map((d) => (
              <option key={d.deliverable_id} value={d.deliverable_id}>
                {d.code} — {isRTL && d.name_ar ? d.name_ar : d.name}
              </option>
            ))}
          </select>
          {selectedDeliverable && (
            <p className="mt-2 text-sm text-gray-600">
              {t('deliverables.discipline')}: {t(`disciplines.${selectedDeliverable.discipline}`)}
              {' · '}
              {t('deliverables.format')}: {selectedDeliverable.format}
              {' · '}
              {t('deliverables.phase')} {selectedDeliverable.phase_number}
            </p>
          )}
        </div>
      </FormSection>

      {/* ─────────────── SECTION B: Purpose ─────────────── */}
      <FormSection letter="B" title={t('approvalForm.sectionPurpose')} hint={t('approvalForm.sectionPurposeHint')}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SUBMITTAL_PURPOSES.map((p) => (
            <label
              key={p.value}
              className={cn(
                'flex items-center p-4 border rounded-lg cursor-pointer transition-colors',
                purpose === p.value
                  ? 'bg-[#e6f2f2]'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              )}
              style={purpose === p.value ? { borderColor: '#045859' } : undefined}
            >
              <input
                type="radio"
                name="purpose"
                value={p.value}
                checked={purpose === p.value}
                onChange={() => setPurpose(p.value)}
                className="w-4 h-4 cursor-pointer"
                style={{ accentColor: '#045859' }}
              />
              <span className="ms-3 font-medium text-gray-900">{t(p.labelKey)}</span>
            </label>
          ))}
        </div>
      </FormSection>

      {/* ─────────────── SECTION B2: Request Type ─────────────── */}
      <FormSection
        letter="B2"
        title={t('requestType.label')}
        hint={t('requestType.hint')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {REQUEST_TYPES.map((r) => (
            <label
              key={r.value}
              className={cn(
                'flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors',
                requestType === r.value
                  ? 'bg-[#e6f2f2]'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              )}
              style={requestType === r.value ? { borderColor: '#045859' } : undefined}
            >
              <input
                type="radio"
                name="requestType"
                value={r.value}
                checked={requestType === r.value}
                onChange={() => setRequestType(r.value)}
                className="w-4 h-4 cursor-pointer mt-1"
                style={{ accentColor: '#045859' }}
              />
              <div>
                <div className="font-medium text-gray-900">{t(r.labelKey)}</div>
                <div className="text-xs text-gray-600 mt-0.5">{t(r.descKey)}</div>
              </div>
            </label>
          ))}
        </div>
      </FormSection>

      {/* ─────────────── SECTION C: Disciplines ─────────────── */}
      <FormSection
        letter="C"
        title={t('approvalForm.sectionDisciplines')}
        hint={t('approvalForm.disciplinesHint')}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ALL_DISCIPLINES.map((d) => {
            const on = disciplines.includes(d)
            return (
              <label
                key={d}
                className={cn(
                  'flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors',
                  on ? 'bg-[#e6f2f2]' : 'border-gray-200 bg-white hover:border-gray-300'
                )}
                style={on ? { borderColor: '#045859' } : undefined}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleDiscipline(d)}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: '#045859' }}
                />
                <span className="text-sm font-medium text-gray-900">
                  {t(`disciplines.${d}`)}
                </span>
              </label>
            )
          })}
        </div>
      </FormSection>

      {/* ─────────────── SECTION D: Line Items ─────────────── */}
      <FormSection
        letter="D"
        title={t('approvalForm.sectionLineItems')}
        hint={t('approvalForm.lineItemsHint')}
        actions={
          <button
            type="button"
            onClick={addLineItem}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: '#045859' }}
          >
            <Plus className="w-4 h-4" />
            {t('approvalForm.addLineItem')}
          </button>
        }
      >
        {lineItems.length === 0 ? (
          <div className="p-8 border-2 border-dashed border-gray-300 rounded-lg text-center text-sm text-gray-500">
            {t('approvalForm.noLineItems')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-700 uppercase tracking-wide border-b-2" style={{ backgroundColor: '#f0f7f7', borderColor: '#045859' }}>
                  <th className="px-2 py-3 text-center w-10">#</th>
                  <th className="px-2 py-3 text-start">
                    {t('approvalForm.outputName')} <span className="text-red-600">*</span>
                  </th>
                  <th className="px-2 py-3 text-start w-32">{t('approvalForm.drawingNumber')}</th>
                  <th className="px-2 py-3 text-start w-28">{t('approvalForm.format')}</th>
                  <th className="px-2 py-3 text-start w-24">{t('approvalForm.revisionNumber')}</th>
                  <th className="px-2 py-3 text-start">{t('approvalForm.description')}</th>
                  <th className="px-2 py-3 text-center w-12"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li) => (
                  <tr key={li.clientId} className="border-b border-gray-100">
                    <td className="px-2 py-2 text-center font-mono text-gray-600">{li.item_no}</td>
                    <td className="px-2 py-2">
                      <input
                        value={isRTL ? li.output_name_ar : li.output_name}
                        onChange={(e) =>
                          updateLineItem(
                            li.clientId,
                            isRTL ? 'output_name_ar' : 'output_name',
                            e.target.value
                          )
                        }
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#045859]"
                        placeholder={t('approvalForm.outputName')}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={li.drawing_number}
                        onChange={(e) => updateLineItem(li.clientId, 'drawing_number', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#045859]"
                        placeholder="DWG-001"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={li.format}
                        onChange={(e) => updateLineItem(li.clientId, 'format', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#045859]"
                      >
                        <option value="">—</option>
                        {ALL_FORMATS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={li.revision_number}
                        onChange={(e) => updateLineItem(li.clientId, 'revision_number', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#045859]"
                        placeholder="R0"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={isRTL ? li.description_ar : li.description}
                        onChange={(e) =>
                          updateLineItem(
                            li.clientId,
                            isRTL ? 'description_ar' : 'description',
                            e.target.value
                          )
                        }
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#045859]"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeLineItem(li.clientId)}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                        title={t('approvalForm.removeLineItem')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FormSection>

      {/* ─────────────── SECTION E: Notes (visible to everyone, Submitter editable) ─────────────── */}
      <FormSection
        letter="E"
        title={t('approvalForm.sectionNotes')}
        hint={t('approvalForm.sectionNotesHint')}
      >
        <div className="mt-1">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            {t('approvalForm.sectionNotes')}{' '}
            <span className="text-xs text-gray-500 font-normal">
              ({t('common.optional')})
            </span>
          </label>
          <textarea
            value={isRTL ? notesAr : notes}
            onChange={(e) => (isRTL ? setNotesAr(e.target.value) : setNotes(e.target.value))}
            rows={5}
            placeholder={t('approvalForm.notesPlaceholder')}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#045859] text-base"
            dir={isRTL ? 'rtl' : 'ltr'}
          />
        </div>
      </FormSection>

      {/* ─────────────── ATTACHMENTS: File Upload + External Link ─────────────── */}
      <FormSection
        letter=""
        title={t('approvalForm.fileUpload')}
        hint={t('common.optional')}
      >
        <div className="space-y-5">
          {/* File upload (200 MB max, drag & drop) */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              {t('approvalForm.fileUpload')}
            </label>
            <p className="text-xs text-gray-500 mb-3">{t('approvalForm.fileUploadHint')}</p>
            <FileUpload
              onUploaded={(f) => setUploadedFile(f)}
              onRemoved={() => setUploadedFile(null)}
              value={uploadedFile}
              submittalId={selectedDeliverableId || undefined}
              disabled={isSubmitting}
            />
          </div>

          {/* External file link */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              <span className="inline-flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-gray-500" />
                {t('approvalForm.fileLink')}
              </span>
              <span className="text-xs text-gray-500 font-normal ms-2">
                ({t('common.optional')})
              </span>
            </label>
            <p className="text-xs text-gray-500 mb-2">{t('approvalForm.fileLinkHint')}</p>
            <input
              type="url"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder={t('approvalForm.fileLinkPlaceholder')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#045859] text-sm"
              dir="ltr"
              disabled={isSubmitting}
            />
            {fileUrl && !/^https?:\/\/.+/.test(fileUrl) && (
              <p className="mt-1 text-xs text-red-500">{t('approvalForm.fileLinkInvalid')}</p>
            )}
          </div>
        </div>
      </FormSection>

      {/* ─────────────── SECTION F: Specialized Consultant (approval roles only) ─────────────── */}
      {showApprovalSections && (
      <FormSection
        letter="F"
        title={t('approvalForm.sectionSpecializedConsultant')}
        hint={t('common.optional')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              {t('approvalForm.specializedName')}
            </label>
            <input
              value={specializedName}
              onChange={(e) => setSpecializedName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#045859]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              {t('approvalForm.specializedRemarks')}
            </label>
            <input
              value={specializedRemarks}
              onChange={(e) => setSpecializedRemarks(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#045859]"
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          * {t('approvalForm.specializedActionCode')} — {t('review.coordinatorHint')}
        </p>
      </FormSection>
      )}

      {/* ─────────────── SECTION G: Owner / Internal (approval roles only) ─────────────── */}
      {showApprovalSections && (
      <FormSection letter="G" title={t('approvalForm.sectionOwner')}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <OwnerSlot label={t('approvalForm.ownerPC')} />
          <OwnerSlot label={t('approvalForm.ownerPM')} />
          <OwnerSlot label={t('approvalForm.ownerFinal')} />
        </div>
        <p className="mt-3 text-xs text-gray-500 italic">
          {t('review.coordinatorHint')}
        </p>
      </FormSection>
      )}

      {/* ─────────────── SECTION H: Action Codes (approval roles only — submitters don't set codes) ─────────────── */}
      {showApprovalSections && (
      <FormSection letter="H" title={t('approvalForm.sectionActionCodes')}>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <li className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
            <CodePill code="A" />
            <span className="text-gray-800">{t('approvalForm.actionA')}</span>
          </li>
          <li className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
            <CodePill code="B" />
            <span className="text-gray-800">{t('approvalForm.actionB')}</span>
          </li>
          <li className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
            <CodePill code="C" />
            <span className="text-gray-800">{t('approvalForm.actionC')}</span>
          </li>
          <li className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
            <CodePill code="D" />
            <span className="text-gray-800">{t('approvalForm.actionD')}</span>
          </li>
        </ul>
      </FormSection>
      )}

      {/* ─────────────── Actions ─────────────── */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 py-4 -mx-6 lg:-mx-8 px-6 lg:px-8 z-20">
        <div
          className="flex flex-wrap items-center gap-3 max-w-7xl mx-auto"
          aria-busy={isSubmitting}
        >
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="save-draft-btn"
          >
            {submitMode === 'draft' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {submitMode === 'draft' ? t('submittal.creating') : t('approvalForm.saveDraft')}
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#045859' }}
            data-testid="submit-review-btn"
          >
            {submitMode === 'submit' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {submitMode === 'submit' ? t('submittal.creating') : t('approvalForm.submitForReview')}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors ms-auto disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            {t('approvalForm.printForm')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function FormSection({
  letter,
  title,
  hint,
  actions,
  children,
}: {
  letter: string
  title: string
  hint?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <header
        className="flex items-center justify-between px-5 py-3 border-b border-gray-200"
        style={{ backgroundColor: '#f0f7f7' }}
      >
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-white text-sm font-bold"
            style={{ backgroundColor: '#045859' }}
          >
            {letter}
          </span>
          <div>
            <h2 className="text-base font-semibold" style={{ color: '#045859' }}>
              {title}
            </h2>
            {hint && <p className="text-xs text-gray-600 mt-0.5">{hint}</p>}
          </div>
        </div>
        {actions}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 min-h-[38px] flex items-center">
        {value}
      </div>
    </div>
  )
}

function OwnerSlot({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-xs text-gray-400 italic">— Pending workflow —</p>
    </div>
  )
}

function CodePill({ code }: { code: 'A' | 'B' | 'C' | 'D' }) {
  const colors: Record<string, string> = {
    A: '#22c55e',
    B: '#87ba26',
    C: '#FFC845',
    D: '#c05728',
  }
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white font-bold flex-shrink-0"
      style={{ backgroundColor: colors[code] }}
    >
      {code}
    </span>
  )
}
