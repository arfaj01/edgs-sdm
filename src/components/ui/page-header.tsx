'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

interface PageHeaderProps {
  title: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, titleAr, description, descriptionAr, actions }: PageHeaderProps) {
  const { language, isRTL } = useI18n();

  const displayTitle = isRTL && titleAr ? titleAr : title;
  const displayDescription = isRTL && descriptionAr ? descriptionAr : description;

  return (
    <div className="flex flex-col gap-4 mb-8">
      {/* Title */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">{displayTitle}</h1>
        {/* Show secondary title in opposite language */}
        {titleAr && !isRTL && (
          <h2 className="text-xl font-bold text-gray-500" dir="rtl">{titleAr}</h2>
        )}
        {!isRTL ? null : title !== titleAr && (
          <h2 className="text-xl font-bold text-gray-500" dir="ltr">{title}</h2>
        )}
      </div>

      {/* Description */}
      {displayDescription && <p className="text-gray-600 max-w-2xl">{displayDescription}</p>}

      {/* Actions */}
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}
