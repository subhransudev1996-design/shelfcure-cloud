import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

/**
 * One-shot onboarding: creates an organization and the calling user as its super_admin.
 * The auth session must already exist (i.e. the user just signed up).
 */
export async function rpcCreateOrgWithOwner(
  client: Client,
  input: { orgName: string; fullName: string; phone?: string | null },
): Promise<{ orgId: string; profileId: string }> {
  const { data, error } = await client.rpc('rpc_create_org_with_owner', {
    p_org_name: input.orgName,
    p_full_name: input.fullName,
    p_phone: input.phone ?? undefined,
  });

  if (error) throw mapSupabaseError(error);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.org_id || !row.profile_id) {
    throw mapSupabaseError(new Error('rpc_create_org_with_owner returned no row'));
  }

  return { orgId: row.org_id, profileId: row.profile_id };
}
