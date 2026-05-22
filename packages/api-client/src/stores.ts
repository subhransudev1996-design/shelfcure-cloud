import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;
type StoreRow = Database['public']['Tables']['stores']['Row'];
type StoreInsert = Database['public']['Tables']['stores']['Insert'];

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

export async function createStore(client: Client, input: CreateStoreInput): Promise<Store> {
  // Pre-flight: fetch our actual RLS context so we can give a clear error if
  // anything is off (and surface the server's view if the insert still fails).
  const ctx = await whoami(client);

  if (!ctx.auth_uid) {
    throw new Error('Not signed in. Please refresh and sign in again.');
  }
  if (!ctx.profile_id) {
    throw new Error(
      'Your user profile does not exist. Try signing out and going through onboarding again.',
    );
  }
  if (ctx.profile_role !== 'super_admin') {
    throw new Error(
      `Only the organization super_admin can create stores. Your profile role is "${ctx.profile_role}".`,
    );
  }
  if (ctx.user_role_fn !== 'super_admin') {
    throw new Error(
      `Server-side role check failed. user_role() returned "${ctx.user_role_fn}" but your profile says "${ctx.profile_role}". This is a server bug — please report.`,
    );
  }
  if (!ctx.current_org_fn || ctx.current_org_fn !== ctx.profile_org) {
    throw new Error(
      `current_org() returned "${ctx.current_org_fn}" but your profile org_id is "${ctx.profile_org}". This is a server bug — please report.`,
    );
  }

  const payload: StoreInsert = {
    org_id: ctx.profile_org,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    city: input.city?.trim() ?? '',
    state: input.state?.trim() ?? '',
    pincode: input.pincode?.trim() ?? '',
    phone: input.phone?.trim() ?? '',
    gstin: input.gstin?.trim() || null,
    drug_license_no: input.drug_license_no?.trim() || null,
  };

  const { data, error } = await client.from('stores').insert(payload).select('*').single();

  if (error) {
    const ctxStr = JSON.stringify(ctx, null, 2);
    throw new Error(
      `Insert failed: ${error.message}\n\nServer context at time of insert:\n${ctxStr}\n\nPayload org_id: ${payload.org_id}`,
    );
  }

  return data;
}
