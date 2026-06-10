import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;
type CustomerRow = Database['public']['Tables']['customers']['Row'];

export type Customer = CustomerRow;

export interface ListCustomersOptions {
  search?: string;
  storeId?: string | null;
  limit?: number;
}

export async function listCustomers(
  client: Client,
  opts: ListCustomersOptions = {},
): Promise<Customer[]> {
  let q = client
    .from('customers')
    .select('*')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(opts.limit ?? 200);

  if (opts.storeId !== undefined) {
    if (opts.storeId === null) q = q.is('store_id', null);
    else q = q.eq('store_id', opts.storeId);
  }
  if (opts.search?.trim()) {
    const s = opts.search.trim();
    q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);
  return data ?? [];
}

export interface CreateCustomerInput {
  storeId: string | null;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  customerType?: 'b2c' | 'b2b';
  gstin?: string;
  state?: string;
  creditLimit?: number | null;
  creditDays?: number | null;
}

/** Create a customer via the secure RPC (same pattern as createStore / createSupplier). */
export async function createCustomer(
  client: Client,
  input: CreateCustomerInput,
): Promise<Customer> {
  const payload = {
    store_id: input.storeId,
    name: input.name.trim(),
    phone: input.phone?.trim() ?? '',
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    customer_type: input.customerType ?? 'b2c',
    gstin: input.gstin?.trim().toUpperCase() || null,
    state: input.state?.trim() || null,
    credit_limit: input.creditLimit ?? null,
    credit_days: input.creditDays ?? null,
  };
  const { data, error } = await client.rpc('rpc_create_customer', { p_payload: payload as never });
  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw mapSupabaseError(new Error('rpc_create_customer returned no row'));

  const fetched = await client.from('customers').select('*').eq('id', row.id).single();
  if (fetched.error || !fetched.data) {
    throw mapSupabaseError(fetched.error ?? new Error('customer created but read-back failed'));
  }
  return fetched.data;
}
