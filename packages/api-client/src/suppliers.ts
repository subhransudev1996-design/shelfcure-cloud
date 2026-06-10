import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

export interface Supplier {
  id: string;
  name: string;
  city: string;
  state: string;
  phone: string;
  gstin: string | null;
  is_active: boolean;
}

export async function listSuppliers(client: Client, storeId?: string | null): Promise<Supplier[]> {
  const { data, error } = await client.rpc('rpc_list_suppliers', {
    p_store_id: storeId ?? undefined,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Supplier[];
}

export interface CreateSupplierInput {
  name: string;
  store_id?: string | null;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  contact_person?: string;
  credit_limit?: number | null;
  credit_days?: number | null;
}

export async function createSupplier(client: Client, input: CreateSupplierInput): Promise<Supplier> {
  const payload = {
    ...input,
    name: input.name.trim(),
    gstin: input.gstin?.trim().toUpperCase() || undefined,
  };
  const { data, error } = await client.rpc('rpc_create_supplier', { p_payload: payload as never });
  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw mapSupabaseError(new Error('rpc_create_supplier returned no row'));
  return row as Supplier;
}
