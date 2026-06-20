// Browser-side Supabase client for use in Client Components.
import { createBrowserSupabaseClient } from '@shelfcure/api-client';

export function getSupabaseBrowserClient() {
  return createBrowserSupabaseClient();
}
