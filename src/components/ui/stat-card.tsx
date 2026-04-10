import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'amber' | 'red' | 'purple';
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
}

const COLOR_CONFIG: Record<string, { bg: string; text: string; icon: string }> = {
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    icon: 'bg-blue-100 text-blue-600',
  },
  green: {
    bg: 'bg-green-50',
    text: 'text-green-600',
    icon: 'bg-green-100 text-green-600',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    icon: 'bg-amber-100 text-amber-600',
  },
  red: {
    bg: 'bg-red-50',
    text: 'text-red-600',
    icon: 'bg-red-100 text-red-600',
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple-600',
    icon: 'bg-purple-100 text-purple-600',
  },
};

export function StatCard({ label, value, icon: Icon, color, trend }: StatCardProps) {
  const config = COLOR_CONFIG[color];

  return (
    <div className={cn('p-6 rounded-lg border border-gray-200 bg-white', config.bg)}>
      {/* Icon */}
      <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center mb-4', config.icon)}>
        <Icon className="w-6 h-6" />
      </div>

      {/* Value */}
      <div className={cn('text-3xl font-bold', config.text)}>{value}</div>

      {/* Label and Trend */}
      <div className="flex items-center justify-between mt-2">
        <p className="text-sm text-gray-600">{label}</p>
        {trend && (
          <div className={cn('text-xs font-medium', trend.direction === 'up' ? 'text-green-600' : 'text-red-600')}>
            {trend.direction === 'up' ? '↑' : '↓'} {trend.value}%
          </div>
        )}
      </div>
    </div>
  );
}
