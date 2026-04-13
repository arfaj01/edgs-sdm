'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSubmittal, useRecordReviewComment, useWorkflowTransition, useUser } from '@/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { SmartHeader } from '@/components/ui/smart-header';
import { WorkflowTimeline } from '@/components/ui/workflow-timeline';
import { SubmittalDetailPanel } from '@/components/ui/submittal-detail-panel';
import { useI18n } from '@/lib/i18n';
import { formatDateTime, cn } from '@/lib/utils';
import type { ActionCode } from '@/types/database';
import { CheckCircle, AlertCircle, Clock } from 'lucide-react';

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const submittalId = params.id as string;
  const transition = useWorkflowTransition();
  const recordComment = useRecordReviewComment();
  const { user } = useUser();
  const { t } = useI18n();
  const { data: submittal, isLoading, error } = useSubmittal(submittalId);

  const [selectedActionCode, setSelectedActionCode] = useState<ActionCode | null>(null);
  const [comments, setComments] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Context-aware action buttons — reviewers (TU/QU) never get reject (D).
  // That trigger lives on the PM approvals page. Here we only show actions
  // the current role can actually perform.
  const ACTION_CODES: Array<{ code: ActionCode; color: string }> = [
    { code: 'A', color: 'green' },
    { code: 'B', color: 'amber' },
    { code: 'C', color: 'orange' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Clock className="w-8 h-8 animate-spin" style={{ color: '#045859' }} />
      </div>
    );
  }

  if (error || !submittal) {
    console.error('[EDGS-FRONT:review-detail] Load error:', error?.message);
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('review.error')}</h1>
          <p className="text-gray-600">{error?.message || t('review.cannotReview')}</p>
        </div>
      </div>
    );
  }

  const canReview = submittal.status === 'submitted' || submittal.status === 'under_review' || submittal.status === 'resubmitted';
  const isCoordinator =
    user?.role === 'technical_unit' ||
    user?.role === 'quality_unit' ||
    user?.role === 'project_coordinator';
  const isPM = user?.role === 'project_manager';

  const handleSubmitReview = async () => {
    if (!selectedActionCode) {
      setSubmitError(t('review.selectAction'));
      return;
    }

    setSubmitError(null);
    setSubmitSuccess(false);
    setIsSubmitting(true);

    try {
      if (selectedActionCode === 'A' || selectedActionCode === 'B') {
        if (!user?.id) throw new Error('Not authenticated');

        console.log('[EDGS-FRONT:review-detail] Recording comment via useRecordReviewComment:', { submittalId, action_code: selectedActionCode });

        await recordComment.mutateAsync({
          submittal_id: submittalId,
          user_id: user.id,
          action_code: selectedActionCode,
          comments: comments || null,
        });

        console.log('[EDGS-FRONT:review-detail] Comment recorded successfully');
      } else {
        let triggerName: string;

        if (selectedActionCode === 'C') {
          triggerName = 'reviewer_return';
        } else if (selectedActionCode === 'D') {
          if (isPM) {
            triggerName = 'reviewer_reject';
          } else {
            setSubmitError(t('review.pmRejectOnly'));
            setIsSubmitting(false);
            return;
          }
        } else {
          throw new Error(`Unknown action code: ${selectedActionCode}`);
        }

        console.log('[EDGS-FRONT:review-detail] Calling useWorkflowTransition:', { submittal_id: submittalId, trigger_name: triggerName, action_code: selectedActionCode });

        const result = await transition.mutateAsync({
          submittal_id: submittalId,
          trigger_name: triggerName,
          action_code: selectedActionCode,
          comments: comments || undefined,
        });

        console.log('[EDGS-FRONT:review-detail] Transition confirmed:', JSON.stringify(result));
      }

      setSubmitSuccess(true);
      setSelectedActionCode(null);
      setComments('');
      setTimeout(() => { setSubmitSuccess(false); router.push(`/deliverables/${submittal.deliverable_id}`); }, 2000);
    } catch (err) {
      console.error('[EDGS-FRONT:review-detail] Error:', err instanceof Error ? err.message : err);
      setSubmitError(err instanceof Error ? err.message : t('review.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title={`${t('review.title')}: ${submittal.submittal_number}`}
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
              <h3 className="font-semibold text-green-900">{t('review.submitted')}</h3>
              <p className="text-sm text-green-700 mt-1">{t('review.submittedSuccess')}</p>
            </div>
          </div>
        )}

        {submitError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-red-900">{t('review.error')}</h3>
              <p className="text-sm text-red-700 mt-1">{submitError}</p>
            </div>
          </div>
        )}

        {/* ─── Full Submittal Detail Panel ─── */}
        <SubmittalDetailPanel submittal={submittal} />

        {/* ─── Review Form ─── */}
        {canReview && (
          <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{t('review.submitReview')}</h2>
              <p className="text-sm text-gray-600 mt-1">
                {isCoordinator ? t('review.coordinatorHint') : ''}
                {isPM ? t('review.pmHint') : ''}
              </p>
            </div>
            <div className="px-6 py-6">
              <div className="mb-8">
                <h3 className="text-base font-semibold text-gray-900 mb-2">
                  {user?.role === 'technical_unit' ? t('ux.tuActionLabel') :
                   user?.role === 'quality_unit' ? t('ux.quActionLabel') :
                   t('review.selectActionCode')}
                </h3>
                <p className="text-xs text-gray-500 mb-4">{t('ux.hiddenActionsHint')}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {ACTION_CODES.map((item) => {
                    const isSelected = selectedActionCode === item.code;
                    const bgColor = { green: 'bg-green-50 border-green-200', amber: 'bg-amber-50 border-amber-200', orange: 'bg-orange-50 border-orange-200', red: 'bg-red-50 border-red-200' }[item.color];
                    const textColor = { green: 'text-green-900', amber: 'text-amber-900', orange: 'text-orange-900', red: 'text-red-900' }[item.color];
                    const borderColor = { green: 'border-green-300', amber: 'border-amber-300', orange: 'border-orange-300', red: 'border-red-300' }[item.color];

                    return (
                      <button
                        key={item.code}
                        onClick={() => setSelectedActionCode(item.code)}
                        className={cn(
                          'p-4 rounded-lg border-2 transition-all',
                          isSelected ? `${bgColor} ${borderColor} ring-2 ring-offset-2` : 'border-gray-200 hover:border-gray-300',
                        )}
                        style={{ textAlign: 'start' }}
                      >
                        <div className={`font-bold text-lg mb-1 ${textColor}`}>{item.code}</div>
                        <div className={`font-semibold text-sm ${textColor} mb-1`}>{t(`actions.${item.code}`)}</div>
                        <div className="text-xs text-gray-600">{t(`actions.${item.code}_desc`)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">{t('review.comments')}</label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder={t('review.commentsPlaceholder')}
                  rows={5}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => { setSelectedActionCode(null); setComments(''); }} className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors">
                  {t('review.clear')}
                </button>
                <button
                  onClick={handleSubmitReview}
                  disabled={!selectedActionCode || isSubmitting}
                  className={cn('px-6 py-2 rounded-lg font-medium transition-colors text-white disabled:bg-gray-400 inline-flex items-center gap-2',
                    selectedActionCode === 'C' ? 'bg-orange-600 hover:bg-orange-700' : ''
                  )}
                  style={!selectedActionCode || selectedActionCode === 'A' || selectedActionCode === 'B' ? { backgroundColor: '#045859' } : {}}
                >
                  {isSubmitting && <Clock className="w-4 h-4 animate-spin" />}
                  {isSubmitting ? t('ux.submitting') : t('review.submit')}
                </button>
              </div>
            </div>
          </div>
        )}

        {!canReview && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-yellow-900">{t('review.cannotReview')}</h3>
              <p className="text-sm text-yellow-700 mt-1">{t('review.cannotReviewStatus')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
