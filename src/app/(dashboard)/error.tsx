'use client';

import { useEffect } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[EDGS:error-boundary] Dashboard error caught:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center max-w-md mx-auto p-8">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">حدث خطأ غير متوقع</h2>
        <p className="text-gray-600 mb-2">An unexpected error occurred</p>
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3 mb-6 font-mono break-all">
          {error.message || 'Unknown error'}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-6 py-3 text-white font-medium rounded-lg transition-colors"
          style={{ backgroundColor: '#045859' }}
        >
          <RotateCcw className="w-4 h-4" />
          إعادة المحاولة / Try Again
        </button>
      </div>
    </div>
  );
}
