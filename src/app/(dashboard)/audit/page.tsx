'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Calendar, User } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { useI18n } from '@/lib/i18n';
import { useAuditLogs } from '@/hooks/use-audit';
import { formatDateTime, cn } from '@/lib/utils';
import type { AuditLog, AuditAction } from '@/types/database';

const ACTION_COLOR_MAP: Record<string, string> = {
  create: 'bg-blue-100 text-blue-800',
  update: 'bg-amber-100 text-amber-800',
  delete: 'bg-red-100 text-red-800',
  status_change: 'bg-cyan-100 text-cyan-800',
  review_submit: 'bg-indigo-100 text-indigo-800',
  approval_submit: 'bg-green-100 text-green-800',
  document_upload: 'bg-purple-100 text-purple-800',
  document_delete: 'bg-red-100 text-red-800',
};

// Map DB action names to translation keys
const ACTION_KEY_MAP: Record<string, string> = {
  create: 'auditActions.created',
  update: 'auditActions.updated',
  delete: 'auditActions.deleted',
  status_change: 'auditActions.status_changed',
  review_submit: 'auditActions.review_submitted',
  approval_submit: 'auditActions.approval_submitted',
  document_upload: 'auditActions.document_uploaded',
  document_delete: 'auditActions.document_deleted',
};

const ENTITY_TYPES = ['submittal', 'document', 'deliverable', 'review', 'approval', 'phase', 'project', 'user'];

interface ExpandedRows {
  [key: string]: boolean;
}

export default function AuditLogPage() {
  const { t } = useI18n();
  const [entityType, setEntityType] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [performerName, setPerformerName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<ExpandedRows>({});

  const perPage = 20;

  const { data: auditData, isLoading, error } = useAuditLogs({
    entityType: entityType || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    performedBy: performerName || undefined,
    page: currentPage,
    perPage,
  });

  const logs = auditData?.data || [];
  const totalPages = auditData?.totalPages || 1;
  const totalCount = auditData?.totalCount || 0;

  const toggleExpanded = (logId: string) => {
    setExpandedRows((prev) => ({ ...prev, [logId]: !prev[logId] }));
  };

  const getActionLabel = (action: string): string => {
    const key = ACTION_KEY_MAP[action];
    return key ? t(key) : action.replace(/_/g, ' ');
  };

  const getEntityTypeLabel = (type: string): string => {
    return t(`entities.${type}`) || type;
  };

  const getActionColor = (action: string): string => {
    return ACTION_COLOR_MAP[action] || 'bg-gray-100 text-gray-800';
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleResetFilters = () => {
    setEntityType('');
    setFromDate('');
    setToDate('');
    setPerformerName('');
    setCurrentPage(1);
    setExpandedRows({});
  };

  const hasActiveFilters = entityType || fromDate || toDate || performerName;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="Audit Log"
          titleAr="سجل المراجعة"
          description={t('audit.description')}
        />

        {/* Filter Bar */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('audit.filters')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">{t('audit.entityType')}</label>
              <select
                value={entityType}
                onChange={(e) => { setEntityType(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="">{t('audit.allTypes')}</option>
                {ENTITY_TYPES.map((key) => (
                  <option key={key} value={key}>{t(`entities.${key}`)}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">{t('audit.fromDate')}</label>
              <div className="relative">
                <Calendar className="absolute start-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
                  className="ps-10 pe-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent w-full"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">{t('audit.toDate')}</label>
              <div className="relative">
                <Calendar className="absolute start-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
                  className="ps-10 pe-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent w-full"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">{t('audit.performedBy')}</label>
              <div className="relative">
                <User className="absolute start-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={performerName}
                  onChange={(e) => { setPerformerName(e.target.value); setCurrentPage(1); }}
                  placeholder={t('audit.searchUser')}
                  className="ps-10 pe-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent w-full"
                />
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-4">
              <button onClick={handleResetFilters} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
                {t('audit.clearFilters')}
              </button>
            </div>
          )}
        </div>

        {/* Results Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <p className="text-sm text-gray-600">
            {t('audit.showing')} <span className="font-semibold">{logs.length}</span> {t('audit.of')}{' '}
            <span className="font-semibold">{totalCount}</span> {t('audit.entries')}
          </p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="bg-white rounded-lg border border-gray-200 p-8">
            <div className="flex items-center justify-center gap-3">
              <div className="w-3 h-3 rounded-full animate-bounce" style={{ backgroundColor: '#045859' }} />
              <div className="w-3 h-3 rounded-full animate-bounce" style={{ backgroundColor: '#045859', animationDelay: '0.2s' }} />
              <div className="w-3 h-3 rounded-full animate-bounce" style={{ backgroundColor: '#045859', animationDelay: '0.4s' }} />
              <span className="ms-2 text-gray-600">{t('audit.loading')}</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-red-800">{t('audit.errorLoading')} {error.message}</p>
          </div>
        )}

        {/* Timeline */}
        {!isLoading && logs.length > 0 && (
          <div className="space-y-4 mb-6">
            {logs.map((log: AuditLog) => {
              const isExpanded = expandedRows[log.id];
              const actionLabel = getActionLabel(log.action);
              const entityTypeLabel = getEntityTypeLabel(log.entity_type);
              const actionColor = getActionColor(log.action);
              const timestamp = formatDateTime(log.created_at);

              return (
                <div key={log.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden transition-all duration-200 hover:shadow-md">
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col items-center pt-1">
                        <div className="w-3 h-3 rounded-full ring-2" style={{ backgroundColor: '#045859', ['--tw-ring-color' as string]: '#e6f2f2' }} />
                        <div className="w-0.5 h-12 bg-gray-200 mt-2" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <time className="text-xs font-medium text-gray-500">{timestamp}</time>
                          <span className={cn('inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold', actionColor)}>{actionLabel}</span>
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">{entityTypeLabel}</span>
                        </div>
                        <div className="mb-2">
                          <p className="text-sm text-gray-900 font-medium">{actionLabel} {entityTypeLabel}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {t('audit.entityId')} <code className="bg-gray-100 px-2 py-1 rounded text-xs" dir="ltr">{log.entity_id}</code>
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-600">
                            {t('audit.performedByLabel')} <code className="bg-gray-100 px-2 py-1 rounded text-xs" dir="ltr">{log.performed_by}</code>
                          </span>
                        </div>
                        <button onClick={() => toggleExpanded(log.id)} className="flex items-center gap-1 text-xs font-medium transition-colors" style={{ color: '#045859' }}>
                          {isExpanded ? (<><ChevronUp className="w-4 h-4" />{t('audit.hideDetails')}</>) : (<><ChevronDown className="w-4 h-4" />{t('audit.showDetails')}</>)}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="bg-gray-50 rounded p-4 space-y-3">
                          <div>
                            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">{t('audit.oldValue')}</h4>
                            <div className="bg-white border border-gray-200 rounded p-2">
                              <pre className="text-xs text-gray-700 overflow-x-auto" dir="ltr">{log.old_value ? JSON.stringify(log.old_value, null, 2) : 'N/A'}</pre>
                            </div>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">{t('audit.newValue')}</h4>
                            <div className="bg-white border border-gray-200 rounded p-2">
                              <pre className="text-xs text-gray-700 overflow-x-auto" dir="ltr">{log.new_value ? JSON.stringify(log.new_value, null, 2) : 'N/A'}</pre>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && logs.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{t('audit.noLogs')}</h3>
            <p className="text-gray-600 max-w-sm mx-auto">
              {hasActiveFilters ? t('audit.adjustFilters') : t('audit.logsAppear')}
            </p>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {t('audit.page')} <span className="font-semibold">{currentPage}</span> {t('audit.of')} <span className="font-semibold">{totalPages}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={goToPreviousPage} disabled={currentPage === 1}
                className={cn('flex items-center gap-1 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'text-white'
                )}
                style={currentPage !== 1 ? { backgroundColor: '#045859' } : {}}
              >
                <ChevronLeft className="w-4 h-4" />{t('audit.previous')}
              </button>
              <button onClick={goToNextPage} disabled={currentPage === totalPages}
                className={cn('flex items-center gap-1 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  currentPage === totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'text-white'
                )}
                style={currentPage !== totalPages ? { backgroundColor: '#045859' } : {}}
              >
                {t('audit.next')}<ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
