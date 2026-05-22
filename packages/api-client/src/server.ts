import { createServerClient } from '@supabase/ssr';
import type { Database } from '@shelfcure/db-types';

/**
 * Minimal cookie-store interface that adapts to Next.js `cookies()` or any
 * other host (Express req/res, Hono context, etc.). The caller is responsible
 * for providing the read/write hooks.
 */
export interface CookieStore {
  getAll: () => { name: string; value: string }[];
  setAll: (
    cookies: { name: string; value: string; options?: Record<string, unknown> }[],
  ) => void;
}

/**
 * Server-side Supabase client. Manages auth session via cookies so that
 * subsequent requests stay authenticated.
 *
 * In Next.js Server Components, `setAll` may no-op (cookies are read-only).
 * That's expected — middleware handles the refresh.
 */
export function createServerSupabaseClient(cookieStore: CookieStore) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Check .env.local.',
    );
  }

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) =>
        cookieStore.setAll(cookiesToSet),
    },
  });
}
