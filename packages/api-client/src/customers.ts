import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;
type CustomerRow = Database['public']['Tables']['customers']['Row'];
type CustomerInsert = Database['public']['Tables']['customers']['Insert'];

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

export async function createCustomer(
  client: Client,
  input: CreateCustomerInput,
): Promise<Customer> {
  const orgRow = await client.from('user_profiles').select('org_id').single();
  if (orgRow.error || !orgRow.data?.org_id) {
    throw mapSupabaseError(orgRow.error ?? new Error('no profile'));
  }
  const payload: CustomerInsert = {
    org_id: orgRow.data.org_id,
    store_id: input.storeId,
    name: input.name.trim(),
    phone: input.phone?.trim() ?? '',
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    customer_type: input.customerType ?? 'b2c',
    gstin: input.gstin?.trim() || null,
    state: input.state?.trim() || null,
    credit_limit: input.creditLimit ?? null,
    credit_days: input.creditDays ?? null,
  };
  const { data, error } = await client.from('customers').insert(payload).select('*').single();
  if (error) throw mapSupabaseError(error);
  return data;
}
