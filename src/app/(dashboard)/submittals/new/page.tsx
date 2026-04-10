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
import { useI18n } from '@/lib/i18n'
import { useDeliverables, useUser, useCreateSubmittal, useWorkflowTransition } from '@/hooks'
import { useSupabase } from '@/hooks/use-supabase'
import { cn } from '@/lib/utils'
import type {
  SubmittalPurpose,
  Discipline,
  DeliverableFormat,
} from '@/types/database'
import { AlertCircle, Plus, Trash2, FileText, Save, Send, CheckCircle2 } from 'lucide-react'

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

const SUBMITTAL_PURPOSES: { value: SubmittalPurpose; labelKey: string }[] = [
  { value: 'for_approval', labelKey: 'submittal.forApproval' },
  { value: 'for_follow_up', labelKey: 'submittal.forFollowUp' },
  { value: 'for_tendering', labelKey: 'submittal.forTendering' },
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
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [notes, setNotes] = useState('')
  const [notesAr, setNotesAr] = useState('')
  const [specializedName, setSpecializedName] = useState('')
  const [specializedRemarks, setSpecializedRemarks] = useState('')
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successId, setSuccessId] = useState<string | null>(null)

  // ── derived ─────────────────────────────────────────────
  const selectedDeliverable = useMemo(
    () => deliverables?.find((d) => d.deliverable_id === selectedDeliverableId),
    [deliverables, selectedDeliverableId]
  )

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
    if (!validate()) return
    setIsSubmitting(true)
    try {
      const resp = await createSubmittal.mutateAsync({
        deliverable_id: selectedDeliverableId,
        purpose: purpose as SubmittalPurpose,
        notes: notes || undefined,
      })
      await persistExtended(resp.id)

      if (submit) {
        try {
          await transition.mutateAsync({
            submittal_id: resp.id,
            trigger_name: 'consultant_submit',
          })
        } catch (e) {
          // If transition fails, the submittal still exists as draft —
          // surface the error but don't throw away user work.
          console.error('Workflow transition failed:', e)
        }
      }

      setSuccessId(resp.id)
      // Longer pause so the user can choose Print or View;
      // a fallback redirect happens after 8 seconds of inactivity.
      setTimeout(() => {
        router.push(`/deliverables/${selectedDeliverableId}`)
      }, 8000)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('approvalForm.createError')
      setErrors([msg])
    } finally {
      setIsSubmitting(false)
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
          <p className="text-sm text-gray-600 mb-6">
            {t('approvalForm.submittalNumber')}
          </p>
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

      {/* Errors */}
      {errors.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-red-900 mb-2">
                {t('submittal.fixErrors')}
              </h3>
              <ul className="space-y-1 text-sm text-red-800">
                {errors.map((e, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-red-600 mt-1">•</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────── SECTION A: Header ─────────────── */}
      <FormSection
        letter="A"
        title={t('approvalForm.sectionHeader')}
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
      <FormSection letter="B" title={t('approvalForm.sectionPurpose')}>
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

      {/* ─────────────── SECTION E: Consultant ─────────────── */}
      <FormSection letter="E" title={t('approvalForm.sectionConsultant')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ReadOnlyField
            label={t('approvalForm.consultantName')}
            value={user?.full_name || '—'}
          />
          <ReadOnlyField
            label={t('approvalForm.consultantOrganization')}
            value={user?.organization || '—'}
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            {t('approvalForm.consultantRemarks')}
          </label>
          <textarea
            value={isRTL ? notesAr : notes}
            onChange={(e) => (isRTL ? setNotesAr(e.target.value) : setNotes(e.target.value))}
            rows={4}
            placeholder={t('approvalForm.consultantRemarksPlaceholder')}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#045859] text-base"
          />
        </div>
      </FormSection>

      {/* ─────────────── SECTION F: Specialized Consultant ─────────────── */}
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

      {/* ─────────────── SECTION G: Owner / Internal ─────────────── */}
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

      {/* ─────────────── SECTION H: Action Codes ─────────────── */}
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

      {/* ─────────────── Actions ─────────────── */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 py-4 -mx-6 lg:-mx-8 px-6 lg:px-8 z-20">
        <div className="flex flex-wrap items-center gap-3 max-w-7xl mx-auto">
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {t('approvalForm.saveDraft')}
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#045859' }}
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? t('submittal.creating') : t('approvalForm.submitForReview')}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2.5 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors ms-auto"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
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
