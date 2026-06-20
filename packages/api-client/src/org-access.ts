import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

export interface OrgAccessResult {
  allowed: boolean;
  reason?: 'suspended';
}

/**
 * Call right after supabase.auth.signInWithPassword succeeds, before
 * navigating anywhere. If `allowed` is false, sign the session back out and
 * show an error on the login form — this is the actual sign-in enforcement
 * point for org suspension (ADR-0018 Console extension), not a per-page
 * check on every subsequent request.
 */
export async function checkOrgAccess(client: Client): Promise<OrgAccessResult> {
  const { data, error } = await client.rpc('rpc_check_org_access');
  if (error) throw mapSupabaseError(error);
  return data as unknown as OrgAccessResult;
}
