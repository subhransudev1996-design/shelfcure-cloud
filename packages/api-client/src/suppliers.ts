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
  outstanding_balance: number;
  credit_limit: number | null;
  is_active: boolean;
}

export interface SupplierFull extends Supplier {
  contact_person: string | null;
  email: string | null;
  pincode: string | null;
  address: string | null;
  credit_days: number | null;
  store_id: string | null;
  org_id: string;
  created_at: string;
  updated_at: string;
}

export interface SupplierQuickStats {
  batch_count: number;
  low_stock_count: number;
  expiry_soon_count: number;
}

export interface SupplierRecentPurchase {
  id: string;
  bill_number: string;
  bill_date: string;
  total_amount: number;
  payment_status: 'paid' | 'pending' | 'partial';
  items_count: number;
}

export interface SupplierDetail {
  supplier: SupplierFull;
  quick_stats: SupplierQuickStats;
  recent_purchases: SupplierRecentPurchase[];
}

export interface SupplierLedgerEntry {
  id: string;
  transaction_type: 'purchase' | 'payment' | 'return' | 'adjustment';
  amount: number;
  balance_after: number;
  payment_method: string | null;
  notes: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface SupplierMedicineRow {
  medicine_id: string;
  medicine_name: string;
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  current_quantity: number;
  purchase_rate: number;
  mrp: number;
  gst_percentage: number;
  days_to_expiry: number;
  min_stock_level: number;
  reorder_level: number;
  is_low_stock: boolean;
  purchase_item_id: string | null;
  purchase_id: string | null;
  last_purchase_date: string | null;
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

export type UpdateSupplierInput = Omit<CreateSupplierInput, 'store_id'>;

export async function listSuppliers(
  client: Client,
  opts?: { storeId?: string | null; filter?: 'all' | 'balance' | 'settled' },
): Promise<Supplier[]> {
  const { data, error } = await client.rpc('rpc_list_suppliers', {
    p_store_id: opts?.storeId ?? undefined,
    p_filter: opts?.filter ?? 'all',
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Supplier[];
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

export async function updateSupplier(
  client: Client,
  supplierId: string,
  input: UpdateSupplierInput,
): Promise<SupplierFull> {
  const { data, error } = await client.rpc('rpc_update_supplier', {
    p_supplier_id: supplierId,
    p_payload: input as never,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as SupplierFull;
}

export async function getSupplierDetail(client: Client, supplierId: string): Promise<SupplierDetail> {
  const { data, error } = await client.rpc('rpc_get_supplier_detail', { p_supplier_id: supplierId });
  if (error) throw mapSupabaseError(error);
  return data as unknown as SupplierDetail;
}

export async function getSupplierLedger(
  client: Client,
  supplierId: string,
  opts?: { limit?: number; offset?: number },
): Promise<SupplierLedgerEntry[]> {
  const { data, error } = await client.rpc('rpc_get_supplier_ledger', {
    p_supplier_id: supplierId,
    p_limit: opts?.limit ?? 50,
    p_offset: opts?.offset ?? 0,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as SupplierLedgerEntry[];
}

export async function recordSupplierPayment(
  client: Client,
  payload: { supplier_id: string; amount: number; payment_method?: string; notes?: string },
): Promise<{ new_balance: number }> {
  const { data, error } = await client.rpc('rpc_record_supplier_payment', {
    p_payload: payload as never,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as { new_balance: number };
}

export async function getSupplierMedicines(
  client: Client,
  supplierId: string,
): Promise<SupplierMedicineRow[]> {
  const { data, error } = await client.rpc('rpc_get_supplier_medicines', {
    p_supplier_id: supplierId,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as SupplierMedicineRow[];
}
