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
    .order('name', { ascending: true })
    .limit(opts.limit ?? 500);

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

// ─── Update ───────────────────────────────────────────────────────────────────

export interface UpdateCustomerInput {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  state?: string;
  customerType?: 'b2c' | 'b2b';
  gstin?: string;
  creditLimit?: number | null;
  creditDays?: number | null;
  specialDiscountType?: 'percentage' | 'flat' | null;
  specialDiscountValue?: number;
  specialDiscountLabel?: string | null;
}

export async function updateCustomer(client: Client, input: UpdateCustomerInput): Promise<void> {
  const payload: Record<string, unknown> = { id: input.id };
  if (input.name !== undefined) payload.name = input.name;
  if (input.phone !== undefined) payload.phone = input.phone;
  if (input.email !== undefined) payload.email = input.email;
  if (input.address !== undefined) payload.address = input.address;
  if (input.state !== undefined) payload.state = input.state;
  if (input.customerType !== undefined) payload.customer_type = input.customerType;
  if (input.gstin !== undefined) payload.gstin = input.gstin;
  if (input.creditLimit !== undefined) payload.credit_limit = input.creditLimit;
  if (input.creditDays !== undefined) payload.credit_days = input.creditDays;
  if (input.specialDiscountType !== undefined) payload.special_discount_type = input.specialDiscountType;
  if (input.specialDiscountValue !== undefined) payload.special_discount_value = input.specialDiscountValue;
  if (input.specialDiscountLabel !== undefined) payload.special_discount_label = input.specialDiscountLabel;

  const { error } = await client.rpc('rpc_update_customer', { p_payload: payload as never });
  if (error) throw mapSupabaseError(error);
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export interface CustomerStats {
  sales_count: number;
  returns_count: number;
  lifetime_value: number;
  avg_bill_value: number;
}

export interface CustomerDetail {
  customer: Customer;
  stats: CustomerStats;
}

export async function getCustomerDetail(client: Client, customerId: string): Promise<CustomerDetail> {
  const { data, error } = await client.rpc('rpc_get_customer_detail', { p_customer_id: customerId });
  if (error) throw mapSupabaseError(error);
  return data as unknown as CustomerDetail;
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

export interface CustomerLedgerEntry {
  id: string;
  transaction_type: 'sale' | 'payment' | 'return' | 'adjustment';
  reference_type: string | null;
  reference_id: string | null;
  amount: number;
  balance_after: number;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
}

export async function getCustomerLedger(
  client: Client,
  customerId: string,
  limit = 50,
  offset = 0,
): Promise<CustomerLedgerEntry[]> {
  const { data, error } = await client.rpc('rpc_get_customer_ledger', {
    p_customer_id: customerId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as CustomerLedgerEntry[];
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export async function recordCustomerPayment(
  client: Client,
  opts: {
    customerId: string;
    amount: number;
    paymentMethod: string;
    notes?: string;
  },
): Promise<{ new_balance: number }> {
  const { data, error } = await client.rpc('rpc_record_customer_payment', {
    p_payload: {
      customer_id: opts.customerId,
      amount: opts.amount,
      payment_method: opts.paymentMethod,
      notes: opts.notes ?? null,
    } as never,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as { new_balance: number };
}

// ─── Routine ──────────────────────────────────────────────────────────────────

export interface CustomerRoutineItem {
  id: string;
  medicine_id: string;
  medicine_name: string;
  sale_unit_mode: string;
  units_per_pack: number | null;
  interval_days: number | null;
  remind_days_before: number;
  last_dispensed_date: string | null;
  next_due_date: string | null;
  days_until_due: number | null;
  notes: string | null;
}

export async function getCustomerRoutine(
  client: Client,
  customerId: string,
): Promise<CustomerRoutineItem[]> {
  const { data, error } = await client.rpc('rpc_get_customer_routine', {
    p_customer_id: customerId,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as CustomerRoutineItem[];
}

export async function upsertCustomerRoutine(
  client: Client,
  opts: {
    customerId: string;
    medicineId: string;
    intervalDays?: number | null;
    remindDaysBefore?: number;
    lastDispensedDate?: string | null;
    notes?: string | null;
  },
): Promise<string> {
  const { data, error } = await client.rpc('rpc_upsert_customer_routine', {
    p_payload: {
      customer_id: opts.customerId,
      medicine_id: opts.medicineId,
      interval_days: opts.intervalDays ?? null,
      remind_days_before: opts.remindDaysBefore ?? 3,
      last_dispensed_date: opts.lastDispensedDate ?? null,
      notes: opts.notes ?? null,
    } as never,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as string;
}

export async function deleteCustomerRoutine(client: Client, id: string): Promise<void> {
  const { error } = await client.rpc('rpc_delete_customer_routine', { p_id: id });
  if (error) throw mapSupabaseError(error);
}

// ─── Customer sales / returns ─────────────────────────────────────────────────

export interface CustomerSaleRow {
  id: string;
  bill_number: string;
  bill_date: string;
  total_amount: number;
  paid_amount: number;
  payment_status: 'paid' | 'pending' | 'partial' | 'credit';
  items_count: number;
  created_at: string;
}

export async function listCustomerSales(
  client: Client,
  customerId: string,
  limit = 50,
  offset = 0,
): Promise<CustomerSaleRow[]> {
  const { data, error } = await client.rpc('rpc_list_customer_sales', {
    p_customer_id: customerId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as CustomerSaleRow[];
}

export interface CustomerReturnRow {
  id: string;
  return_number: string;
  return_date: string;
  bill_number: string;
  sale_id: string;
  total_amount: number;
  refund_method: string | null;
  created_at: string;
}

export async function listCustomerReturns(
  client: Client,
  customerId: string,
  limit = 50,
  offset = 0,
): Promise<CustomerReturnRow[]> {
  const { data, error } = await client.rpc('rpc_list_customer_returns', {
    p_customer_id: customerId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as CustomerReturnRow[];
}
