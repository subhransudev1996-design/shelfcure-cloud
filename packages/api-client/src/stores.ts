import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;
type StoreRow = Database['public']['Tables']['stores']['Row'];
type StoreInsert = Database['public']['Tables']['stores']['Insert'];

export type Store = StoreRow;

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
  const orgRow = await client.from('user_profiles').select('org_id').single();
  if (orgRow.error || !orgRow.data?.org_id) {
    throw mapSupabaseError(orgRow.error ?? new Error('no profile'));
  }
  const payload: StoreInsert = {
    org_id: orgRow.data.org_id,
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
  if (error) throw mapSupabaseError(error);
  return data;
}
