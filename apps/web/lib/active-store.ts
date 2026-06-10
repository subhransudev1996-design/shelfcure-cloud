import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';

type Client = SupabaseClient<Database>;

/**
 * Resolves the "active store" for the signed-in user.
 *   - store-scoped roles (store_admin / pharmacist / cashier) → their assigned store
 *   - org-scoped roles (super_admin / accountant) → first active store in the org
 *   - null if no store is available
 *
 * Used by every operational page (POS, purchases, history) so the same rule
 * lives in one place.
 */
export async function resolveActiveStoreId(supabase: Client): Promise<string | null> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('store_id')
    .single();
  if (profile?.store_id) return profile.store_id;

  const { data: stores } = await supabase
    .from('stores')
    .select('id')
    .eq('is_active', true)
    .order('code', { ascending: true })
    .limit(1);
  return stores?.[0]?.id ?? null;
}
