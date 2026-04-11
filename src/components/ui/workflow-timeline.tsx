'use client';

import React from 'react';
import { Check, Circle, X as XIcon, MinusCircle, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { SubmittalStatus, SubmittalStage } from '@/types/database';
import {
  computeWorkflowState,
  formatTimeRemaining,
} from '@/lib/workflow-sla';

type StepState = 'completed' | 'current' | 'pending' | 'skipped' | 'rejected';

interface TimelineStep {
  key: 'submitter' | 'technical' | 'quality' | 'pm' | 'approved';
  labelKey: string;
  state: StepState;
}

interface WorkflowTimelineProps {
  status: SubmittalStatus;
  stage: SubmittalStage;
  /** Optional — required for overdue highlighting on the current step. */
  submittedAt?: string | null;
  updatedAt?: string | null;
  className?: string;
}

/**
 * Compute the state of each of the 5 steps based on the current submittal
 * status + multi-stage tracker.
 */
function computeSteps(status: SubmittalStatus, stage: SubmittalStage): TimelineStep[] {
  const steps: TimelineStep[] = [
    { key: 'submitter', labelKey: 'ux.timelineStep1', state: 'pending' },
    { key: 'technical', labelKey: 'ux.timelineStep2', state: 'pending' },
    { key: 'quality', labelKey: 'ux.timelineStep3', state: 'pending' },
    { key: 'pm', labelKey: 'ux.timelineStep4', state: 'pending' },
    { key: 'approved', labelKey: 'ux.timelineStep5', state: 'pending' },
  ];

  const setState = (key: TimelineStep['key'], s: StepState) => {
    const step = steps.find(x => x.key === key);
    if (step) step.state = s;
  };

  switch (status) {
    case 'draft':
      setState('submitter', 'current');
      break;
    case 'submitted':
      setState('submitter', 'completed');
      setState('technical', 'current');
      break;
    case 'resubmitted':
      setState('submitter', 'completed');
      // resubmitted returns to the stage where it was returned; default to technical
      if (stage === 'quality') {
        setState('technical', 'completed');
        setState('quality', 'current');
      } else if (stage === 'pm') {
        setState('technical', 'completed');
        setState('quality', 'completed');
        setState('pm', 'current');
      } else {
        setState('technical', 'current');
      }
      break;
    case 'under_review':
      setState('submitter', 'completed');
      if (stage === 'technical' || !stage) {
        setState('technical', 'current');
      } else if (stage === 'quality') {
        setState('technical', 'completed');
        setState('quality', 'current');
      } else if (stage === 'pm') {
        setState('technical', 'completed');
        setState('quality', 'completed');
        setState('pm', 'current');
      }
      break;
    case 'revision_required':
      setState('submitter', 'current');
      // mark whichever stage returned it as rejected for that step
      if (stage === 'quality') {
        setState('technical', 'completed');
        setState('quality', 'rejected');
      } else if (stage === 'pm') {
        setState('technical', 'completed');
        setState('quality', 'completed');
        setState('pm', 'rejected');
      } else {
        setState('technical', 'rejected');
      }
      break;
    case 'approved':
      setState('submitter', 'completed');
      setState('technical', 'completed');
      setState('quality', 'completed');
      setState('pm', 'completed');
      setState('approved', 'completed');
      break;
    case 'rejected':
      setState('submitter', 'completed');
      if (stage === 'pm') {
        setState('technical', 'completed');
        setState('quality', 'completed');
        setState('pm', 'rejected');
      } else if (stage === 'quality') {
        setState('technical', 'completed');
        setState('quality', 'rejected');
      } else {
        setState('technical', 'rejected');
      }
      setState('approved', 'skipped');
      break;
  }

  return steps;
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'completed') {
    return <Check className="w-4 h-4 text-white" strokeWidth={3} />;
  }
  if (state === 'current') {
    return <Circle className="w-3 h-3 fill-white text-white" />;
  }
  if (state === 'rejected') {
    return <XIcon className="w-4 h-4 text-white" strokeWidth={3} />;
  }
  if (state === 'skipped') {
    return <MinusCircle className="w-4 h-4 text-gray-400" />;
  }
  return null;
}

function stepCircleClass(state: StepState, overdue = false): string {
  switch (state) {
    case 'completed':
      return 'bg-[#87ba26] border-[#87ba26]';
    case 'current':
      return overdue
        ? 'bg-red-600 border-red-600 ring-4 ring-red-100 animate-pulse'
        : 'bg-[#045859] border-[#045859] ring-4 ring-[#e6f2f2]';
    case 'rejected':
      return 'bg-red-600 border-red-600';
    case 'skipped':
      return 'bg-gray-100 border-gray-300';
    default:
      return 'bg-white border-gray-300';
  }
}

function connectorClass(prevState: StepState): string {
  if (prevState === 'completed') return 'bg-[#87ba26]';
  if (prevState === 'rejected') return 'bg-red-400';
  return 'bg-gray-200';
}

export function WorkflowTimeline({
  status,
  stage,
  submittedAt,
  updatedAt,
  className,
}: WorkflowTimelineProps) {
  const { t, isRTL } = useI18n();
  const steps = computeSteps(status, stage);

  // Compute overdue/approaching state for the CURRENT step when timing
  // data is provided. A non-null result adds a red AlertTriangle + pill.
  const workflowState = (submittedAt !== undefined || updatedAt !== undefined)
    ? computeWorkflowState({
        status,
        submittal_stage: stage,
        submitted_at: submittedAt ?? null,
        updated_at: updatedAt ?? submittedAt ?? new Date().toISOString(),
      })
    : null;
  const remaining = workflowState
    ? formatTimeRemaining(workflowState.hoursRemaining)
    : null;

  const dueLabel = (() => {
    if (!remaining) return null;
    if (remaining.overdue) {
      return t(
        `reviewsQueue.overdueBy${remaining.unit === 'day' ? 'Day' : 'Hour'}`,
        { n: remaining.magnitude },
      );
    }
    return t(
      `reviewsQueue.dueIn${remaining.unit === 'day' ? 'Day' : 'Hour'}`,
      { n: remaining.magnitude },
    );
  })();

  return (
    <div className={cn('bg-white rounded-lg shadow p-6', className)} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">
          {t('workflow.timelineTitle') || t('ux.overallStatus')}
        </h3>
        {dueLabel && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
              workflowState?.overdue
                ? 'bg-red-100 text-red-700'
                : workflowState?.approaching
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-700',
            )}
          >
            {workflowState?.overdue ? (
              <AlertTriangle className="w-3 h-3" />
            ) : null}
            {dueLabel}
          </span>
        )}
      </div>

      {/* Desktop horizontal layout */}
      <div className="hidden md:block">
        <div className="flex items-start justify-between relative">
          {steps.map((step, idx) => {
            const nextStep = steps[idx + 1];
            return (
              <React.Fragment key={step.key}>
                <div className="flex flex-col items-center flex-1 min-w-0 relative z-10">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all',
                      stepCircleClass(step.state, step.state === 'current' && !!workflowState?.overdue)
                    )}
                  >
                    <StepIcon state={step.state} />
                  </div>
                  <div className="mt-2 text-center px-1">
                    <p
                      className={cn(
                        'text-xs font-semibold',
                        step.state === 'current' && 'text-[#045859]',
                        step.state === 'completed' && 'text-gray-900',
                        step.state === 'rejected' && 'text-red-700',
                        (step.state === 'pending' || step.state === 'skipped') && 'text-gray-400'
                      )}
                    >
                      {t(step.labelKey)}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {step.state === 'completed' && t('ux.stepCompleted')}
                      {step.state === 'current' && t('ux.stepCurrent')}
                      {step.state === 'pending' && t('ux.stepPending')}
                      {step.state === 'skipped' && t('ux.stepSkipped')}
                      {step.state === 'rejected' && t('ux.stepSkipped')}
                    </p>
                  </div>
                </div>
                {nextStep && (
                  <div className="flex-1 h-0.5 mt-4 mx-1 relative z-0" style={{ minWidth: '2rem' }}>
                    <div className={cn('h-full w-full rounded-full', connectorClass(step.state))} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Mobile vertical layout */}
      <div className="md:hidden space-y-3">
        {steps.map((step, idx) => (
          <div key={step.key} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full border-2 flex items-center justify-center',
                  stepCircleClass(step.state, step.state === 'current' && !!workflowState?.overdue)
                )}
              >
                <StepIcon state={step.state} />
              </div>
              {idx < steps.length - 1 && (
                <div className={cn('w-0.5 h-6', connectorClass(step.state))} />
              )}
            </div>
            <div className="flex-1 pt-1">
              <p
                className={cn(
                  'text-sm font-semibold',
                  step.state === 'current' && 'text-[#045859]',
                  step.state === 'completed' && 'text-gray-900',
                  step.state === 'rejected' && 'text-red-700',
                  (step.state === 'pending' || step.state === 'skipped') && 'text-gray-400'
                )}
              >
                {t(step.labelKey)}
              </p>
              <p className="text-xs text-gray-500">
                {step.state === 'completed' && t('ux.stepCompleted')}
                {step.state === 'current' && t('ux.stepCurrent')}
                {step.state === 'pending' && t('ux.stepPending')}
                {step.state === 'skipped' && t('ux.stepSkipped')}
                {step.state === 'rejected' && t('ux.stepSkipped')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
