'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

type ActionCode = 'A' | 'B' | 'C' | 'D';

interface ActionCodeBadgeProps {
  code: ActionCode;
}

const ACTION_CODE_COLORS: Record<ActionCode, string> = {
  A: 'bg-green-100 text-green-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-amber-100 text-amber-800',
  D: 'bg-red-100 text-red-800',
};

export function ActionCodeBadge({ code }: ActionCodeBadgeProps) {
  const { t } = useI18n();
  const color = ACTION_CODE_COLORS[code];
  const label = t(`actions.${code}`);

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm',
          color
        )}
      >
        {code}
      </span>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </div>
  );
}
