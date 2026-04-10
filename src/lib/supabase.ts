import { createBrowserClient, createServerClient } from '@supabase/ssr';

const supabaseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Create a Supabase client for use in the browser.
 * Used in client components and API routes.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Create a Supabase client for use on the server.
 * Used in Server Components and API routes (server-side).
 */
export function createServerClientInstance(
  cookieStore: {
    getAll(): Array<{ name: string; value: string }>;
    setAuth(name: string, value: string): void;
  }
) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAuth(name: string, value: string) {
        cookieStore.setAuth(name, value);
      },
    },
  });
}

/**
 * Export for convenience - use createClient() for browser, createServerClientInstance() for server
 */
export { createBrowserClient, createServerClient } from '@supabase/ssr';
