'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface Step {
  letter: string;
  labelKey: string;
  completed?: boolean;
  active?: boolean;
}

interface StepIndicatorProps {
  steps: Step[];
  className?: string;
}

/**
 * A top-of-form step indicator showing letters A → B → C → D → E.
 * Purely visual / informational — the form remains a single scrolling page,
 * but users can see at a glance how many sections remain.
 */
export function StepIndicator({ steps, className }: StepIndicatorProps) {
  const { t, isRTL } = useI18n();

  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6',
        className
      )}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{t('approvalForm.stepsLabel')}</h3>
      </div>
      <p className="text-xs text-gray-500 mb-4">{t('approvalForm.stepsHint')}</p>

      <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
        {steps.map((step, idx) => (
          <React.Fragment key={step.letter}>
            <div className="flex flex-col items-center min-w-[56px]">
              <div
                className={cn(
                  'w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all',
                  step.completed && 'bg-[#87ba26] border-[#87ba26] text-white',
                  step.active && !step.completed && 'bg-[#045859] border-[#045859] text-white ring-4 ring-[#e6f2f2]',
                  !step.active && !step.completed && 'bg-white border-gray-300 text-gray-400'
                )}
              >
                {step.completed ? <Check className="w-4 h-4" strokeWidth={3} /> : step.letter}
              </div>
              <span
                className={cn(
                  'text-[10px] mt-1 font-medium text-center',
                  (step.completed || step.active) ? 'text-gray-900' : 'text-gray-400'
                )}
              >
                {t(step.labelKey)}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 mb-5 min-w-[16px]',
                  step.completed ? 'bg-[#87ba26]' : 'bg-gray-200'
                )}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
