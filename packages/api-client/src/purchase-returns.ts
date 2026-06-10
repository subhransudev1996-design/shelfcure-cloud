import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

// ============================================================================
// Create Return — search a purchase by bill number
// ============================================================================

export interface PurchaseForReturnItem {
  id: string;
  medicine_id: string;
  medicine_name: string | null;
  batch_id: string | null;
  batch_number: string | null;
  quantity: number;
  free_quantity: number | null;
  returned_quantity: number;
  amount: number;
  gst_percentage: number;
  batch_current_quantity: number;
  sold_quantity: number;
  sale_unit_mode: string;
  units_per_pack: number;
}

export interface PurchaseForReturn {
  purchase: {
    id: string;
    bill_number: string;
    bill_date: string;
    supplier_id: string;
    supplier_name: string | null;
    subtotal: number;
    gst_amount: number;
    total_amount: number;
  };
  items: PurchaseForReturnItem[];
}

export async function getPurchaseForReturn(
  client: Client,
  storeId: string,
  billNumber: string,
): Promise<PurchaseForReturn> {
  const { data, error } = await client.rpc('rpc_get_purchase_for_return', {
    p_store_id: storeId,
    p_bill_number: billNumber,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as PurchaseForReturn;
}

// ============================================================================
// Returns List
// ============================================================================

export interface PurchaseReturnRecord {
  id: string;
  return_number: string;
  return_date: string;
  bill_number: string | null;
  supplier_id: string;
  supplier_name: string | null;
  total_amount: number;
  item_count: number;
}

export async function listPurchaseReturns(
  client: Client,
  storeId: string,
  limit = 100,
): Promise<PurchaseReturnRecord[]> {
  const { data, error } = await client.rpc('rpc_list_purchase_returns', {
    p_store_id: storeId,
    p_limit: limit,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as PurchaseReturnRecord[];
}

// ============================================================================
// Return Detail
// ============================================================================

export interface PurchaseReturnDetailItem {
  id: string;
  medicine_id: string;
  medicine_name: string | null;
  batch_id: string;
  batch_number: string | null;
  quantity: number;
  amount: number;
  purchase_rate: number;
  gst_percentage: number;
  sale_unit_mode: string;
  units_per_pack: number;
}

export interface PurchaseReturnDetail {
  header: {
    id: string;
    return_number: string;
    return_date: string;
    subtotal: number;
    gst_amount: number;
    total_amount: number;
    reason: string | null;
    purchase_id: string | null;
    bill_number: string | null;
    bill_date: string | null;
    supplier_id: string;
    supplier_name: string | null;
  };
  items: PurchaseReturnDetailItem[];
  items_incomplete: boolean;
  items_sum: number;
}

export async function getPurchaseReturnDetail(client: Client, returnId: string): Promise<PurchaseReturnDetail> {
  const { data, error } = await client.rpc('rpc_get_purchase_return_detail', { p_return_id: returnId });
  if (error) throw mapSupabaseError(error);
  return data as unknown as PurchaseReturnDetail;
}

// ============================================================================
// Update / Delete
// ============================================================================

export interface UpdatePurchaseReturnInput {
  id: string;
  return_date?: string;
  reason?: string | null;
  items: { id: string; amount: number }[];
}

export async function updatePurchaseReturn(client: Client, input: UpdatePurchaseReturnInput): Promise<void> {
  const { error } = await client.rpc('rpc_update_purchase_return', { p_payload: input as never });
  if (error) throw mapSupabaseError(error);
}

export async function deletePurchaseReturn(client: Client, returnId: string): Promise<void> {
  const { error } = await client.rpc('rpc_delete_purchase_return', { p_return_id: returnId });
  if (error) throw mapSupabaseError(error);
}
