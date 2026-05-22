import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@shelfcure/db-types';

/**
 * Browser-side Supabase client. Uses the publishable key only.
 * Safe to call from React components, hooks, client-side scripts.
 * Internally memoizes a singleton — repeat calls return the same instance.
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Check .env.local.',
    );
  }

  return createBrowserClient<Database>(url, key);
}
