'use client';

import { useMemo } from 'react';
import { createClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Hook to access the Supabase browser client.
 * Returns a memoized client instance to prevent unnecessary re-renders.
 */
export function useSupabase(): SupabaseClient {
  return useMemo(() => createClient(), []);
}
