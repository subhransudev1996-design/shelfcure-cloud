// Server-side Supabase client for Server Components, Route Handlers, Server Actions.
// Reads/writes session cookies via Next.js cookies() API.
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@shelfcure/api-client';

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerSupabaseClient({
    getAll: () => cookieStore.getAll().map((c) => ({ name: c.name, value: c.value })),
    setAll: (cookiesToSet) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // Called from a Server Component (read-only). Middleware handles refresh.
      }
    },
  });
}
