'use client';

import { useI18n } from '@/lib/i18n';
import { formatDate, formatDateTime, formatFileSize } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/status-badge';
import { ActionCodeBadge } from '@/components/ui/action-code-badge';
import type { SubmittalDetail } from '@/hooks';
import {
  Download,
  ExternalLink,
  FileText,
  Layers,
  MapPin,
  User,
  Clock,
  AlertTriangle,
  CalendarDays,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';

interface SubmittalDetailPanelProps {
  submittal: SubmittalDetail;
}

/**
 * Full submittal detail panel — renders the complete submission package
 * for downstream reviewers and approvers. Shows everything needed to
 * make an informed decision: project context, deliverable metadata,
 * submitter info, notes, line items, attachments, links, review history,
 * and workflow journey.
 */
export function SubmittalDetailPanel({ submittal }: SubmittalDetailPanelProps) {
  const { t, language } = useI18n();
  const isAr = language === 'ar';

  // Derive stages from reviews for the workflow journey section
  const stageMap: Record<string, string> = {
    technical: 'Technical Unit',
    quality: 'Quality Unit',
    pm: 'Project Manager',
    returned: 'Returned',
  };

  const stageMapAr: Record<string, string> = {
    technical: 'الوحدة الفنية',
    quality: 'وحدة الجودة',
    pm: 'مدير المشروع',
    returned: 'مُعاد',
  };

  const getStageName = (stage: string | null | undefined) => {
    if (!stage) return '—';
    return isAr ? (stageMapAr[stage] || stage) : (stageMap[stage] || stage);
  };

  // Compute next expected stage
  const getNextStage = () => {
    const s = submittal.submittal_stage;
    if (s === 'technical') return getStageName('quality');
    if (s === 'quality') return getStageName('pm');
    if (s === 'pm') return isAr ? 'الاعتماد النهائي' : 'Final Approval';
    return '—';
  };

  // Compute remaining time from due_at
  const getRemainingTime = () => {
    const dueAt = (submittal as Record<string, unknown>).due_at as string | null;
    if (!dueAt) return null;
    const due = new Date(dueAt);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (diffHours < 0) {
      return { overdue: true, text: `${Math.abs(diffHours)}h ${t('detail.overdue')}` };
    }
    if (diffHours < 24) return { overdue: false, text: `${diffHours}h` };
    return { overdue: false, text: `${Math.round(diffHours / 24)}d ${diffHours % 24}h` };
  };

  const remaining = getRemainingTime();

  // Find tech/quality/pm decisions from reviews
  const techReview = submittal.reviews.find(
    (r) => r.reviewer_role === 'technical_unit' || r.reviewer_role === 'project_coordinator'
  );
  const qualityReview = submittal.reviews.find(
    (r) => r.reviewer_role === 'quality_unit'
  );

  return (
    <div className="space-y-6">
      {/* ─── Project & Deliverable Context ─── */}
      {(submittal.deliverable || submittal.project_name) && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200" style={{ backgroundColor: '#f0f7f7' }}>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Layers className="w-5 h-5" style={{ color: '#045859' }} />
              {t('detail.deliverableInfo')}
            </h2>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {submittal.project_name && (
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('detail.projectName')}</p>
                  <p className="mt-1 text-base text-gray-900">{isAr ? (submittal.project_name_ar || submittal.project_name) : submittal.project_name}</p>
                  {submittal.project_code && (
                    <p className="text-xs text-gray-500 font-mono">{submittal.project_code}</p>
                  )}
                </div>
              )}
              {submittal.deliverable && (
                <>
                  <div>
                    <p className="text-sm font-medium text-gray-500">{t('detail.deliverableName')}</p>
                    <p className="mt-1 text-base text-gray-900">
                      {isAr ? (submittal.deliverable.name_ar || submittal.deliverable.name) : submittal.deliverable.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">{t('detail.deliverableCode')}</p>
                    <p className="mt-1 text-base font-mono text-gray-900">{submittal.deliverable.code}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">{t('detail.discipline')}</p>
                    <p className="mt-1 text-base text-gray-900 capitalize">{submittal.deliverable.discipline}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">{t('detail.deliverableFormat')}</p>
                    <p className="mt-1 text-base font-mono text-gray-900">{submittal.deliverable.format}</p>
                  </div>
                  {submittal.deliverable.planned_date && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">{t('detail.plannedDate')}</p>
                      <p className="mt-1 text-base text-gray-900">{formatDate(submittal.deliverable.planned_date)}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Submittal Core Details ─── */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{t('review.submittalDetails')}</h2>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">{t('review.number')}</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{submittal.submittal_number}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{t('review.status')}</p>
              <div className="mt-1"><StatusBadge status={submittal.status} /></div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{t('detail.stage')}</p>
              <p className="mt-1 text-base text-gray-900 flex items-center gap-1">
                <MapPin className="w-4 h-4" style={{ color: '#045859' }} />
                {getStageName(submittal.submittal_stage)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{t('review.version')}</p>
              <p className="mt-1 text-base font-mono text-gray-900">v{submittal.version}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{t('detail.submitterName')}</p>
              <p className="mt-1 text-base text-gray-900 flex items-center gap-1">
                <User className="w-4 h-4 text-gray-400" />
                {submittal.submitter_name || submittal.submitted_by || '—'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{t('review.submittedAt')}</p>
              <p className="mt-1 text-base text-gray-900">{submittal.submitted_at ? formatDateTime(submittal.submitted_at) : '—'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{t('review.purpose')}</p>
              <p className="mt-1 text-base text-gray-900 capitalize">{submittal.purpose?.replace(/_/g, ' ')}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{t('detail.requestType')}</p>
              <p className="mt-1 text-base text-gray-900">
                {submittal.request_type === 'study' ? t('detail.study') : submittal.request_type === 'execution' ? t('detail.execution') : (submittal.request_type || '—')}
              </p>
            </div>
            {/* Assigned to */}
            <div>
              <p className="text-sm font-medium text-gray-500">{t('detail.assignedTo')}</p>
              <p className="mt-1 text-base text-gray-900 flex items-center gap-1">
                <User className="w-4 h-4 text-gray-400" />
                {submittal.assigned_user_name || t('detail.unassigned')}
              </p>
            </div>
            {/* Due date / SLA */}
            {remaining && (
              <div>
                <p className="text-sm font-medium text-gray-500">{t('detail.remainingTime')}</p>
                <p className={`mt-1 text-base font-semibold flex items-center gap-1 ${remaining.overdue ? 'text-red-600' : 'text-green-700'}`}>
                  {remaining.overdue ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  {remaining.text}
                </p>
              </div>
            )}
            {/* Disciplines */}
            {submittal.disciplines && submittal.disciplines.length > 0 && (
              <div className="col-span-2">
                <p className="text-sm font-medium text-gray-500">{t('detail.disciplines')}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {submittal.disciplines.map((d) => (
                    <span key={d} className="inline-block px-2 py-0.5 text-xs font-medium rounded-full capitalize" style={{ backgroundColor: '#e6f2f2', color: '#045859' }}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* Previous submittal reference */}
            {submittal.previous_submittal_id && (
              <div>
                <p className="text-sm font-medium text-gray-500">{t('detail.submissionType')}</p>
                <p className="mt-1 text-base text-gray-900">{t('detail.resubmission')}</p>
                {submittal.previous_submittal_date && (
                  <p className="text-xs text-gray-500">{t('detail.previousSubmittalDate')}: {formatDate(submittal.previous_submittal_date)}</p>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          {(submittal.notes || submittal.notes_ar) && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              {submittal.notes && (
                <div className="mb-2">
                  <p className="text-sm font-medium text-gray-500 mb-1">{t('detail.notes')}</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded p-3">{submittal.notes}</p>
                </div>
              )}
              {submittal.notes_ar && (
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">{t('detail.notesAr')}</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded p-3" dir="rtl">{submittal.notes_ar}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Workflow Journey / Decision Trail ─── */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200" style={{ backgroundColor: '#f0f7f7' }}>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ArrowRight className="w-5 h-5" style={{ color: '#045859' }} />
            {t('detail.workflowJourney')}
          </h2>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">{t('detail.stage')}</p>
              <p className="mt-1 text-base font-semibold" style={{ color: '#045859' }}>
                {getStageName(submittal.submittal_stage)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{t('detail.currentOwner')}</p>
              <p className="mt-1 text-base text-gray-900">
                {submittal.assigned_user_name || (submittal as Record<string, unknown>).assigned_role as string || t('detail.unassigned')}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{t('detail.nextStage')}</p>
              <p className="mt-1 text-base text-gray-900 flex items-center gap-1">
                <ArrowRight className="w-4 h-4 text-gray-400" />
                {getNextStage()}
              </p>
            </div>
            {/* Technical decision */}
            <div>
              <p className="text-sm font-medium text-gray-500">{t('detail.technicalDecision')}</p>
              <div className="mt-1">
                {techReview ? (
                  <div className="flex items-center gap-2">
                    <ActionCodeBadge code={techReview.action_code} />
                    <span className="text-xs text-gray-500">{formatDateTime(techReview.reviewed_at)}</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </div>
            </div>
            {/* Quality decision */}
            <div>
              <p className="text-sm font-medium text-gray-500">{t('detail.qualityDecision')}</p>
              <div className="mt-1">
                {qualityReview ? (
                  <div className="flex items-center gap-2">
                    <ActionCodeBadge code={qualityReview.action_code} />
                    <span className="text-xs text-gray-500">{formatDateTime(qualityReview.reviewed_at)}</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </div>
            </div>
            {/* Final approval */}
            <div>
              <p className="text-sm font-medium text-gray-500">{t('detail.finalApproval')}</p>
              <div className="mt-1">
                {submittal.approval ? (
                  <div className="flex items-center gap-2">
                    <ActionCodeBadge code={submittal.approval.action_code} />
                    <span className="text-xs text-gray-500">{formatDateTime(submittal.approval.decision_date)}</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Documents / Attachments / Links ─── */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5" style={{ color: '#045859' }} />
            {t('review.attachedDocs')}
          </h2>
        </div>
        <div>
          {/* External link */}
          {submittal.file_url && (
            <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 hover:bg-gray-50">
              <ExternalLink className="w-5 h-5 flex-shrink-0" style={{ color: '#045859' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{t('detail.fileUrl')}</p>
                <p className="text-xs text-gray-500 truncate">{submittal.file_url}</p>
              </div>
              <a href={submittal.file_url} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded text-sm font-medium" style={{ color: '#045859', backgroundColor: '#e6f2f2' }}>
                {t('detail.openLink')}
              </a>
            </div>
          )}

          {/* Storage attachment */}
          {submittal.file_attachment_path && (
            <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 hover:bg-gray-50">
              <Download className="w-5 h-5 flex-shrink-0" style={{ color: '#045859' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{t('detail.fileAttachment')}</p>
                <p className="text-xs text-gray-500 truncate">{submittal.file_attachment_path}</p>
              </div>
              <button className="px-3 py-1.5 rounded text-sm font-medium" style={{ color: '#045859', backgroundColor: '#e6f2f2' }}>
                {t('detail.downloadFile')}
              </button>
            </div>
          )}

          {/* Document records */}
          {submittal.documents && submittal.documents.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {submittal.documents.map((doc) => (
                <div key={doc.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{doc.file_name}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {formatFileSize(doc.file_size_bytes)}
                      {doc.drawing_number && <> &middot; {t('detail.drawingNumber')}: {doc.drawing_number}</>}
                      {doc.revision_number && <> &middot; Rev {doc.revision_number}</>}
                    </p>
                  </div>
                  <a href={`#download-${doc.id}`}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 transition-colors"
                    style={{ marginInlineStart: '1rem', color: '#045859', backgroundColor: '#e6f2f2' }}>
                    <Download className="w-4 h-4" />
                    <span className="text-sm font-medium">{t('review.download')}</span>
                  </a>
                </div>
              ))}
            </div>
          ) : (
            !submittal.file_url && !submittal.file_attachment_path && (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">
                {t('common.noData')}
              </div>
            )
          )}
        </div>
      </div>

      {/* ─── Line Items / Submission Contents ─── */}
      {submittal.line_items && submittal.line_items.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">{t('detail.lineItems')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('detail.lineItemNo')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('detail.lineItemName')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('detail.drawingNumber')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('detail.format')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('detail.revisionNumber')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('detail.description')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {submittal.line_items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{item.item_no}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {isAr ? (item.output_name_ar || item.output_name) : item.output_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{item.drawing_number || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{item.format || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{item.revision_number || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {isAr ? (item.description_ar || item.description || '—') : (item.description || '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Review History ─── */}
      {submittal.reviews && submittal.reviews.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">{t('review.previousReviews')}</h2>
          </div>
          <div className="px-6 py-4">
            <div className="flex flex-col gap-4">
              {submittal.reviews.map((review, index) => (
                <div key={review.id} className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-700">
                      {review.review_step || index + 1}
                    </div>
                    {index < submittal.reviews.length - 1 && (
                      <div className="w-0.5 h-12 bg-gray-300 my-2" />
                    )}
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">{review.reviewer_id}</p>
                        <p className="text-xs text-gray-500 capitalize">{review.reviewer_role?.replace(/_/g, ' ')}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{formatDateTime(review.reviewed_at)}</p>
                      </div>
                      <ActionCodeBadge code={review.action_code} />
                    </div>
                    {review.comments && (
                      <p className="text-gray-700 bg-gray-50 rounded p-3 text-sm mt-3">{review.comments}</p>
                    )}
                    {review.comments_ar && (
                      <p className="text-gray-700 bg-gray-50 rounded p-3 text-sm mt-2" dir="rtl">{review.comments_ar}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Existing Approval ─── */}
      {submittal.approval && (
        <div className="bg-white rounded-lg shadow overflow-hidden border-2 border-green-200">
          <div className="px-6 py-4 border-b border-green-200 bg-green-50">
            <h2 className="text-lg font-semibold text-green-900 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              {t('approval.finalDecision')}
            </h2>
          </div>
          <div className="px-6 py-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-semibold text-gray-900">{submittal.approval.approved_by}</p>
                <p className="text-sm text-gray-500 mt-1">{formatDateTime(submittal.approval.decision_date)}</p>
              </div>
              <ActionCodeBadge code={submittal.approval.action_code} />
            </div>
            {submittal.approval.comments && (
              <p className="text-gray-700 bg-gray-50 rounded p-4 text-sm mb-4">{submittal.approval.comments}</p>
            )}
            {submittal.approval.comments_ar && (
              <p className="text-gray-700 bg-gray-50 rounded p-4 text-sm mb-4" dir="rtl">{submittal.approval.comments_ar}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
