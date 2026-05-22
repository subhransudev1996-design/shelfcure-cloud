import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;
type StoreRow = Database['public']['Tables']['stores']['Row'];

export type Store = StoreRow;

export interface WhoamiResult {
  auth_uid: string | null;
  user_role_fn: string | null;
  current_org_fn: string | null;
  current_store_fn: string | null;
  profile_id: string | null;
  profile_role: string | null;
  profile_org: string | null;
  profile_store: string | null;
  profile_email: string | null;
  profile_is_active: boolean | null;
}

export async function whoami(client: Client): Promise<WhoamiResult> {
  const { data, error } = await client.rpc('rpc_whoami');
  if (error) throw mapSupabaseError(error);
  return data as unknown as WhoamiResult;
}

export interface PolicyRow {
  policy_name: string;
  cmd: string;
  permissive: string;
  roles: string[];
  qual: string | null;
  with_check: string | null;
}

export async function listPolicies(client: Client, tableName: string): Promise<PolicyRow[]> {
  const { data, error } = await client.rpc('rpc_list_policies', { p_table: tableName });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as PolicyRow[];
}

export async function listStores(client: Client): Promise<Store[]> {
  const { data, error } = await client
    .from('stores')
    .select('*')
    .order('code', { ascending: true });
  if (error) throw mapSupabaseError(error);
  return data ?? [];
}

export interface CreateStoreInput {
  code: string;
  name: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  gstin?: string;
  drug_license_no?: string;
}

/**
 * Create a store via the secure RPC.
 *
 * Why RPC instead of a raw .from('stores').insert()?
 *   1) Sidesteps PostgREST-level RLS quirks that have bitten this table.
 *   2) Centralises the super_admin check on the server (single source of truth).
 *   3) Matches the pattern every other create-master-record op will follow
 *      (rpc_commit_sale, rpc_commit_purchase, etc.).
 */
export async function createStore(client: Client, input: CreateStoreInput): Promise<Store> {
  const payload = {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    city: input.city?.trim() ?? '',
    state: input.state?.trim() ?? '',
    pincode: input.pincode?.trim() ?? '',
    phone: input.phone?.trim() ?? '',
    gstin: input.gstin?.trim() || null,
    drug_license_no: input.drug_license_no?.trim() || null,
  };

  const { data, error } = await client.rpc('rpc_create_store', { p_payload: payload as never });
  if (error) throw mapSupabaseError(error);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw mapSupabaseError(new Error('rpc_create_store returned no row'));

  // Fetch the full Store row so consumers get the complete shape they expect.
  const fetched = await client.from('stores').select('*').eq('id', row.id).single();
  if (fetched.error || !fetched.data) {
    throw mapSupabaseError(fetched.error ?? new Error('store created but read-back failed'));
  }
  return fetched.data;
}
