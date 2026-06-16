import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

export interface PosSearchResult {
  medicine_id: string;
  name: string;
  manufacturer: string;
  pack_size: number;
  pack_unit: string;
  hsn_code: string | null;
  default_gst_rate: number;
  batch_id: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  mrp: number | null;
  selling_price: number | null;
  purchase_rate: number | null;
  gst_percentage: number;
  current_quantity: number;
  sale_unit_mode: 'pack_only' | 'both' | 'individual';
  units_per_pack: number | null;
}

export async function posSearchMedicines(
  client: Client,
  storeId: string,
  query: string,
  limit = 12,
): Promise<PosSearchResult[]> {
  const { data, error } = await client.rpc('rpc_pos_search_medicines', {
    p_store_id: storeId,
    p_query: query,
    p_limit: limit,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as PosSearchResult[];
}

export interface PosBatchOption {
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  current_quantity: number;
  mrp: number;
  selling_price: number | null;
  purchase_rate: number;
  gst_percentage: number;
  days_to_expiry: number;
  supplier_name: string | null;
}

export async function posListBatchesForMedicine(
  client: Client,
  storeId: string,
  medicineId: string,
): Promise<PosBatchOption[]> {
  const { data, error } = await client.rpc('rpc_pos_list_batches_for_medicine', {
    p_store_id: storeId,
    p_medicine_id: medicineId,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as PosBatchOption[];
}

// ── Phase C ──

export interface PosQuickAccess {
  favorites: PosSearchResult[];
  focused: PosSearchResult[];
  high_margin: PosSearchResult[];
  fast_moving_7d: PosSearchResult[];
  fast_moving_30d: PosSearchResult[];
  frequently_bought: PosSearchResult[];
  customer_medicines: PosSearchResult[];
  near_expiry: PosSearchResult[];
  overstock: PosSearchResult[];
}

export async function posQuickAccess(
  client: Client,
  storeId: string,
  customerId: string | null = null,
  limit = 12,
): Promise<PosQuickAccess> {
  const { data, error } = await client.rpc('rpc_pos_quick_access', {
    p_store_id: storeId,
    p_customer_id: customerId ?? undefined,
    p_limit_per: limit,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? {
    favorites: [], focused: [], high_margin: [], fast_moving_7d: [], fast_moving_30d: [],
    frequently_bought: [], customer_medicines: [], near_expiry: [], overstock: [],
  }) as unknown as PosQuickAccess;
}

export async function posToggleFavourite(
  client: Client,
  medicineId: string,
  value: boolean,
): Promise<void> {
  const { error } = await client.rpc('rpc_pos_toggle_favourite', {
    p_medicine_id: medicineId,
    p_value: value,
  });
  if (error) throw mapSupabaseError(error);
}

export interface PosRecentBillItem extends PosSearchResult {
  original_qty: number;
}

export async function posRecentBillItems(
  client: Client,
  storeId: string,
  customerId: string,
): Promise<PosRecentBillItem[]> {
  const { data, error } = await client.rpc('rpc_pos_recent_bill_items', {
    p_store_id: storeId,
    p_customer_id: customerId,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as PosRecentBillItem[];
}

// ── Quick Access Hotkey Groups (Alt+1-9, named groups of medicines) ──

export interface PosHotkeyItem {
  medicine_id: string;
  name: string;
  manufacturer: string;
  mrp: number | null;
  total_stock: number;
  quantity: number;
}

export interface PosHotkeyGroup {
  digit: number;            // 1-9
  name: string | null;      // user-set label, e.g. "Fever Pack"
  items: PosHotkeyItem[];
}

export async function posGetHotkeyGroups(
  client: Client,
  storeId: string,
): Promise<PosHotkeyGroup[]> {
  const { data, error } = await client.rpc('rpc_pos_get_hotkey_groups', { p_store_id: storeId });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as PosHotkeyGroup[];
}

export async function posSetHotkeyName(
  client: Client,
  storeId: string,
  digit: number,
  name: string,
): Promise<void> {
  const { error } = await client.rpc('rpc_pos_set_hotkey_name', {
    p_store_id: storeId, p_digit: digit, p_name: name,
  });
  if (error) throw mapSupabaseError(error);
}

export async function posAddHotkeyMedicine(
  client: Client,
  storeId: string,
  digit: number,
  medicineId: string,
  quantity = 1,
): Promise<void> {
  const { error } = await client.rpc('rpc_pos_add_hotkey_medicine', {
    p_store_id: storeId, p_digit: digit, p_medicine_id: medicineId, p_quantity: quantity,
  });
  if (error) throw mapSupabaseError(error);
}

export async function posRemoveHotkeyMedicine(
  client: Client,
  storeId: string,
  digit: number,
  medicineId: string,
): Promise<void> {
  const { error } = await client.rpc('rpc_pos_remove_hotkey_medicine', {
    p_store_id: storeId, p_digit: digit, p_medicine_id: medicineId,
  });
  if (error) throw mapSupabaseError(error);
}

export async function posClearHotkeyGroup(
  client: Client,
  storeId: string,
  digit: number,
): Promise<void> {
  const { error } = await client.rpc('rpc_pos_clear_hotkey_group', {
    p_store_id: storeId, p_digit: digit,
  });
  if (error) throw mapSupabaseError(error);
}

export async function posNextBillNumber(client: Client, storeId: string, prefix = 'INV'): Promise<string> {
  const { data, error } = await client.rpc('rpc_pos_next_bill_number', {
    p_store_id: storeId,
    p_prefix: prefix,
  });
  if (error) throw mapSupabaseError(error);
  if (typeof data !== 'string') throw mapSupabaseError(new Error('rpc_pos_next_bill_number returned no value'));
  return data;
}

export interface PosStoreContext {
  store_id: string;
  store_code: string;
  store_name: string;
  store_state: string;
  org_gstin: string | null;
  org_name: string;
}

export interface PosCustomerResult {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  customer_type: 'b2c' | 'b2b';
  gstin: string | null;
  state: string | null;
  outstanding: number;
  // Customer-profile special discount — auto-applied on POS, read-only.
  special_discount_type: 'percentage' | 'flat' | null;
  special_discount_value: number;
  special_discount_label: string | null;
}

export async function posSearchCustomers(
  client: Client,
  storeId: string,
  query: string,
  limit = 8,
): Promise<PosCustomerResult[]> {
  const { data, error } = await client.rpc('rpc_pos_search_customers', {
    p_store_id: storeId,
    p_query: query,
    p_limit: limit,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as PosCustomerResult[];
}

export async function posGetCustomer(
  client: Client,
  customerId: string,
): Promise<PosCustomerResult | null> {
  const { data, error } = await client.rpc('rpc_pos_get_customer', { p_customer_id: customerId });
  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as PosCustomerResult | null;
}

export async function posGetStoreContext(client: Client, storeId: string): Promise<PosStoreContext | null> {
  const { data, error } = await client.rpc('rpc_pos_get_store_context', { p_store_id: storeId });
  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as PosStoreContext | null;
}
