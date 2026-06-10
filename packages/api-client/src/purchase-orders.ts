import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

export interface PurchaseOrderRecord {
  id: string;
  supplier_id: string;
  supplier_name: string;
  order_date: string;
  status: 'pending' | 'fulfilled' | 'cancelled';
  total_items: number;
  linked_purchase_id: string | null;
  created_at: string;
}

export async function listPurchaseOrders(
  client: Client,
  storeId: string,
  status: string | null = 'pending',
): Promise<PurchaseOrderRecord[]> {
  const { data, error } = await client.rpc('rpc_list_purchase_orders', {
    p_store_id: storeId,
    p_status: status ?? undefined,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as PurchaseOrderRecord[];
}

export interface PurchaseOrderItem {
  id: string;
  medicine_id: string;
  medicine_name: string;
  requested_quantity: number;
  sale_unit_mode: string;
  units_per_pack: number;
}

export interface PurchaseOrderDetail {
  order: PurchaseOrderRecord & { store_id: string; notes: string | null };
  items: PurchaseOrderItem[];
}

export async function getPurchaseOrder(client: Client, poId: string): Promise<PurchaseOrderDetail> {
  const { data, error } = await client.rpc('rpc_get_purchase_order', { p_po_id: poId });
  if (error) throw mapSupabaseError(error);
  return data as unknown as PurchaseOrderDetail;
}

export interface CreatePurchaseOrderInput {
  store_id: string;
  supplier_id: string;
  notes?: string;
  items: { medicine_id: string; requested_quantity: number }[];
}

export async function createPurchaseOrder(client: Client, input: CreatePurchaseOrderInput): Promise<string> {
  const { data, error } = await client.rpc('rpc_create_purchase_order', { p_payload: input as never });
  if (error) throw mapSupabaseError(error);
  return data as unknown as string;
}

export async function markPurchaseOrderFulfilled(client: Client, poId: string, purchaseId: string): Promise<void> {
  const { error } = await client.rpc('rpc_mark_purchase_order_fulfilled', {
    p_po_id: poId,
    p_purchase_id: purchaseId,
  });
  if (error) throw mapSupabaseError(error);
}
