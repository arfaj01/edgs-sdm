'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSubmittal, useSupabase, useUser } from '@/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { ActionCodeBadge } from '@/components/ui/action-code-badge';
import { useI18n } from '@/lib/i18n';
import { formatDate, formatDateTime, formatFileSize, cn } from '@/lib/utils';
import type { ActionCode } from '@/types/database';
import { Download, CheckCircle, AlertCircle, Clock } from 'lucide-react';

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const submittalId = params.id as string;
  const supabase = useSupabase();
  const { user } = useUser();
  const { t } = useI18n();
  const { data: submittal, isLoading, error } = useSubmittal(submittalId);

  const [selectedActionCode, setSelectedActionCode] = useState<ActionCode | null>(null);
  const [comments, setComments] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ACTION_CODES: Array<{ code: ActionCode; color: string }> = [
    { code: 'A', color: 'green' },
    { code: 'B', color: 'amber' },
    { code: 'C', color: 'orange' },
    { code: 'D', color: 'red' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Clock className="w-8 h-8 animate-spin" style={{ color: '#045859' }} />
      </div>
    );
  }

  if (error || !submittal) {
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
  // Allow Technical Unit, Quality Unit, and legacy project_coordinator to perform reviews
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
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) throw new Error('Not authenticated');

        const { data: rpcResult, error: rpcError } = await supabase.rpc('record_review_comment', {
          p_submittal_id: submittalId,
          p_user_id: authUser.id,
          p_action_code: selectedActionCode,
          p_comments: comments || null,
        });

        if (rpcError) throw new Error(rpcError.message);
        if (rpcResult && !rpcResult.success) throw new Error(rpcResult.error);

        setSubmitSuccess(true);
        setSelectedActionCode(null);
        setComments('');
        setTimeout(() => { setSubmitSuccess(false); router.push(`/deliverables/${submittal.deliverable_id}`); }, 2000);
        setIsSubmitting(false);
        return;
      }

      const { error: transitionError } = await supabase.functions.invoke('workflow-transition', {
        body: { submittal_id: submittalId, trigger_name: triggerName, action_code: selectedActionCode, comments: comments || undefined },
      });

      if (transitionError) throw new Error(transitionError.message);

      setSubmitSuccess(true);
      setSelectedActionCode(null);
      setComments('');
      setTimeout(() => { setSubmitSuccess(false); router.push(`/deliverables/${submittal.deliverable_id}`); }, 2000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('review.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title={`${t('review.title')}: ${submittal.submittal_number}`}
        description={`${t('review.version')} ${submittal.version} | ${formatDateTime(submittal.submitted_at)}`}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        {/* Submittal Details */}
        <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
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
                <p className="text-sm font-medium text-gray-500">{t('review.purpose')}</p>
                <p className="mt-1 text-base text-gray-900">{submittal.purpose}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{t('review.submittedBy')}</p>
                <p className="mt-1 text-base text-gray-900">{submittal.submitted_by}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{t('review.submittedAt')}</p>
                <p className="mt-1 text-base text-gray-900">{formatDate(submittal.submitted_at)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{t('review.version')}</p>
                <p className="mt-1 text-base font-mono text-gray-900">v{submittal.version}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Documents */}
        {submittal.documents && submittal.documents.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{t('review.attachedDocs')}</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {submittal.documents.map((doc) => (
                <div key={doc.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{doc.file_name}</p>
                    <p className="text-sm text-gray-500 mt-1">{formatFileSize(doc.file_size_bytes)}</p>
                  </div>
                  <a href={`#download-${doc.id}`} className="inline-flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 transition-colors" style={{ marginInlineStart: '1rem', color: '#045859', backgroundColor: '#e6f2f2' }}>
                    <Download className="w-4 h-4" />
                    <span className="text-sm font-medium">{t('review.download')}</span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Previous Reviews */}
        {submittal.reviews && submittal.reviews.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{t('review.previousReviews')}</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {submittal.reviews.map((review) => (
                <div key={review.id} className="px-6 py-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-gray-900">{review.reviewer_id}</p>
                      <p className="text-sm text-gray-500 mt-1">{formatDateTime(review.reviewed_at)}</p>
                    </div>
                    <ActionCodeBadge code={review.action_code} />
                  </div>
                  {review.comments && (
                    <p className="text-gray-700 bg-gray-50 rounded p-3 text-sm mt-3">{review.comments}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Review Form */}
        {canReview && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{t('review.submitReview')}</h2>
              <p className="text-sm text-gray-600 mt-1">
                {isCoordinator ? t('review.coordinatorHint') : ''}
                {isPM ? t('review.pmHint') : ''}
              </p>
            </div>
            <div className="px-6 py-6">
              <div className="mb-8">
                <h3 className="text-base font-semibold text-gray-900 mb-4">{t('review.selectActionCode')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {ACTION_CODES.map((item) => {
                    const isDisabled = item.code === 'D' && !isPM;
                    const isSelected = selectedActionCode === item.code;
                    const bgColor = { green: 'bg-green-50 border-green-200', amber: 'bg-amber-50 border-amber-200', orange: 'bg-orange-50 border-orange-200', red: 'bg-red-50 border-red-200' }[item.color];
                    const textColor = { green: 'text-green-900', amber: 'text-amber-900', orange: 'text-orange-900', red: 'text-red-900' }[item.color];
                    const borderColor = { green: 'border-green-300', amber: 'border-amber-300', orange: 'border-orange-300', red: 'border-red-300' }[item.color];

                    return (
                      <button
                        key={item.code}
                        onClick={() => !isDisabled && setSelectedActionCode(item.code)}
                        disabled={isDisabled}
                        className={cn(
                          'p-4 rounded-lg border-2 transition-all',
                          isDisabled && 'opacity-50 cursor-not-allowed',
                          isSelected ? `${bgColor} ${borderColor} ring-2 ring-offset-2` : 'border-gray-200 hover:border-gray-300',
                        )}
                        title={isDisabled ? t('review.pmOnly') : ''}
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
                  className={cn('px-6 py-2 rounded-lg font-medium transition-colors text-white disabled:bg-gray-400',
                    selectedActionCode === 'C' ? 'bg-orange-600 hover:bg-orange-700' :
                    selectedActionCode === 'D' ? 'bg-red-600 hover:bg-red-700' : ''
                  )}
                  style={!selectedActionCode || selectedActionCode === 'A' || selectedActionCode === 'B' ? { backgroundColor: '#045859' } : {}}
                >
                  {isSubmitting ? t('common.loading') : t('review.submit')}
                </button>
              </div>
            </div>
          </div>
        )}

        {!canReview && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
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
