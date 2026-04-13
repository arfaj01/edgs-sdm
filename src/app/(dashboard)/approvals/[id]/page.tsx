'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSubmittal, useWorkflowTransition } from '@/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { SmartHeader } from '@/components/ui/smart-header';
import { WorkflowTimeline } from '@/components/ui/workflow-timeline';
import { SubmittalDetailPanel } from '@/components/ui/submittal-detail-panel';
import { useI18n } from '@/lib/i18n';
import { formatDateTime, cn } from '@/lib/utils';
import type { ActionCode } from '@/types/database';
import { CheckCircle, AlertCircle, Clock } from 'lucide-react';

// PM approval: simplified to 2 final outcomes — Approve (A) or Reject (D).
// Intermediate codes (B/C) are reviewer-only.
const ACTION_CODES: Array<{ code: ActionCode; color: string; labelKey: string }> = [
  { code: 'A', color: 'green', labelKey: 'ux.pmFinalApprove' },
  { code: 'D', color: 'red', labelKey: 'ux.pmFinalReject' },
];

export default function ApprovalPage() {
  const params = useParams();
  const router = useRouter();
  const submittalId = params.id as string;
  const transition = useWorkflowTransition();
  const { t } = useI18n();
  const { data: submittal, isLoading, error } = useSubmittal(submittalId);

  const [selectedActionCode, setSelectedActionCode] = useState<ActionCode | null>(null);
  const [comments, setComments] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Clock className="w-8 h-8 animate-spin" style={{ color: '#045859' }} />
      </div>
    );
  }

  if (error || !submittal) {
    console.error('[EDGS-FRONT:approval-detail] Load error:', error?.message);
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('common.error')}</h1>
          <p className="text-gray-600">{error?.message || t('approval.cannotApprove')}</p>
        </div>
      </div>
    );
  }

  const canApprove = submittal.status === 'under_review';
  const hasApproval = submittal.approval !== null;

  const handleSubmitApproval = async () => {
    if (!selectedActionCode) {
      setSubmitError(t('review.selectAction'));
      return;
    }

    setSubmitError(null);
    setSubmitSuccess(false);
    setIsSubmitting(true);

    try {
      const triggerName = selectedActionCode === 'D' ? 'owner_reject' : 'owner_approve';

      console.log('[EDGS-FRONT:approval-detail] Calling useWorkflowTransition:', { submittal_id: submittalId, trigger_name: triggerName, action_code: selectedActionCode });

      const result = await transition.mutateAsync({
        submittal_id: submittalId,
        trigger_name: triggerName,
        action_code: selectedActionCode,
        comments: comments || undefined,
      });

      console.log('[EDGS-FRONT:approval-detail] Transition confirmed:', JSON.stringify(result));

      setSubmitSuccess(true);
      setSelectedActionCode(null);
      setComments('');
      setTimeout(() => { setSubmitSuccess(false); router.push(`/deliverables/${submittal.deliverable_id}`); }, 2000);
    } catch (err) {
      console.error('[EDGS-FRONT:approval-detail] Error:', err instanceof Error ? err.message : err);
      setSubmitError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title={`${t('approval.title')}: ${submittal.submittal_number}`}
        description={`${t('review.version')} ${submittal.version} | ${submittal.submitted_at ? formatDateTime(submittal.submitted_at) : ''}`}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Smart Header — status / stage / assignee strip */}
        <SmartHeader
          status={submittal.status}
          stage={submittal.submittal_stage}
          submittalNumber={submittal.submittal_number}
          submittedAt={submittal.submitted_at}
          updatedAt={submittal.updated_at}
          assignedTo={submittal.assigned_user_name}
        />

        {/* Workflow Timeline — visual progress */}
        <WorkflowTimeline
          status={submittal.status}
          stage={submittal.submittal_stage}
          submittedAt={submittal.submitted_at}
          updatedAt={submittal.updated_at}
          className="mb-6"
        />

        {/* Success / Error banners */}
        {submitSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-green-900">{t('approval.submitted')}</h3>
              <p className="text-sm text-green-700 mt-1">{t('approval.submittedSuccess')}</p>
            </div>
          </div>
        )}

        {submitError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-red-900">{t('common.error')}</h3>
              <p className="text-sm text-red-700 mt-1">{submitError}</p>
            </div>
          </div>
        )}

        {/* ─── Full Submittal Detail Panel ─── */}
        <SubmittalDetailPanel submittal={submittal} />

        {/* ─── Approval Form ─── */}
        {canApprove && !hasApproval && (
          <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{t('approval.submitDecision')}</h2>
              <p className="text-sm text-gray-600 mt-1">{t('approval.decisionHint')}</p>
            </div>
            <div className="px-6 py-6">
              <div className="mb-8">
                <h3 className="text-base font-semibold text-gray-900 mb-2">{t('ux.pmActionLabel')}</h3>
                <p className="text-xs text-gray-500 mb-4">{t('ux.hiddenActionsHint')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ACTION_CODES.map((item) => {
                    const isSelected = selectedActionCode === item.code;
                    const bgColor = { green: 'bg-green-50 border-green-200', amber: 'bg-amber-50 border-amber-200', orange: 'bg-orange-50 border-orange-200', red: 'bg-red-50 border-red-200' }[item.color];
                    const textColor = { green: 'text-green-900', amber: 'text-amber-900', orange: 'text-orange-900', red: 'text-red-900' }[item.color];
                    const borderColor = { green: 'border-green-300', amber: 'border-amber-300', orange: 'border-orange-300', red: 'border-red-300' }[item.color];

                    return (
                      <button
                        key={item.code}
                        onClick={() => setSelectedActionCode(item.code)}
                        className={cn('p-5 rounded-lg border-2 transition-all', isSelected ? `${bgColor} ${borderColor} ring-2 ring-offset-2` : 'border-gray-200 hover:border-gray-300')}
                        style={{ textAlign: 'start' }}
                      >
                        <div className={`font-bold text-lg mb-1 ${textColor}`}>{t(item.labelKey)}</div>
                        <div className={`font-semibold text-xs ${textColor} mb-1`}>{t(`actions.${item.code}`)}</div>
                        <div className="text-xs text-gray-600">{t(`actions.${item.code}_desc`)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">{t('approval.decisionComments')}</label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder={t('approval.commentsPlaceholder')}
                  rows={5}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => { setSelectedActionCode(null); setComments(''); }} className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors">
                  {t('review.clear')}
                </button>
                <button
                  onClick={handleSubmitApproval}
                  disabled={!selectedActionCode || isSubmitting}
                  className={cn('px-6 py-2 rounded-lg font-medium transition-colors text-white disabled:bg-gray-400 inline-flex items-center gap-2',
                    selectedActionCode === 'D' ? 'bg-red-600 hover:bg-red-700' : ''
                  )}
                  style={selectedActionCode !== 'D' ? { backgroundColor: '#045859' } : {}}
                >
                  {isSubmitting && <Clock className="w-4 h-4 animate-spin" />}
                  {isSubmitting ? t('ux.submitting') : selectedActionCode === 'D' ? t('ux.pmFinalReject') : t('ux.pmFinalApprove')}
                </button>
              </div>
            </div>
          </div>
        )}

        {!canApprove && !hasApproval && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-yellow-900">{t('approval.cannotApprove')}</h3>
              <p className="text-sm text-yellow-700 mt-1">{t('approval.cannotApproveStatus')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
