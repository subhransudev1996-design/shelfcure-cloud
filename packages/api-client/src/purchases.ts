import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

// ─── Rate guard ──────────────────────────────────────────────────────────────

export interface RecentPurchaseRate {
  rate: number;
  bill_date: string;
  supplier_name: string;
}

export async function getRecentPurchaseRates(
  client: Client,
  storeId: string,
  medicineId: string,
  limit = 3,
): Promise<RecentPurchaseRate[]> {
  const { data, error } = await client.rpc('rpc_get_recent_purchase_rates', {
    p_store_id: storeId,
    p_medicine_id: medicineId,
    p_limit: limit,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as RecentPurchaseRate[];
}

export async function checkDuplicateBill(
  client: Client,
  storeId: string,
  supplierId: string,
  billNumber: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('rpc_check_duplicate_bill', {
    p_store_id: storeId,
    p_supplier_id: supplierId,
    p_bill_number: billNumber,
  });
  if (error) throw mapSupabaseError(error);
  return data as boolean;
}

// ─── AI bill-scan quota ─────────────────────────────────────────────────────────

export interface AiScanQuota {
  allowed: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
}

export async function checkAiScanQuota(client: Client, storeId: string): Promise<AiScanQuota> {
  const { data, error } = await client.rpc('rpc_check_ai_scan_quota', { p_store_id: storeId });
  if (error) throw mapSupabaseError(error);
  return data as unknown as AiScanQuota;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export interface PurchaseListRow {
  id: string;
  bill_number: string;
  bill_date: string;
  supplier_id: string;
  supplier_name: string | null;
  total_amount: number;
  payment_status: 'paid' | 'pending' | 'partial';
  is_ai_scanned: boolean;
  return_status: 'none' | 'partially_returned' | 'fully_returned';
  created_at: string;
}

export async function listPurchases(
  client: Client,
  storeId: string,
  from?: string,
  to?: string,
  limit = 100,
  offset = 0,
): Promise<PurchaseListRow[]> {
  const { data, error } = await client.rpc('rpc_list_purchases', {
    p_store_id: storeId,
    p_from: from ?? undefined,
    p_to: to ?? undefined,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as PurchaseListRow[];
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export interface PurchaseDetailHeader {
  id: string;
  bill_number: string;
  bill_date: string;
  supplier_id: string;
  supplier_name: string | null;
  supplier_gstin: string | null;
  store_name: string;
  store_code: string;
  subtotal: number;
  taxable_amount: number;
  gst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_status: 'paid' | 'pending' | 'partial';
  paid_amount: number;
  payment_method: string | null;
  is_ai_scanned: boolean;
  notes: string | null;
}

export interface PurchaseDetailItem {
  id: string;
  medicine_id: string;
  medicine_name: string;
  batch_id: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  quantity: number;
  free_quantity: number;
  returned_quantity: number;
  purchase_rate: number;
  mrp: number;
  gst_percentage: number;
  discount_percentage: number | null;
  amount: number;
  sale_unit_mode: 'pack_only' | 'both' | 'individual';
  units_per_pack: number | null;
}

export interface PurchaseDetail {
  purchase: PurchaseDetailHeader;
  items: PurchaseDetailItem[];
}

export async function getPurchaseDetail(
  client: Client,
  purchaseId: string,
): Promise<PurchaseDetail> {
  const { data, error } = await client.rpc('rpc_get_purchase_detail', {
    p_purchase_id: purchaseId,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as PurchaseDetail;
}

// ─── Soft-delete ──────────────────────────────────────────────────────────────

export async function softDeletePurchase(
  client: Client,
  purchaseId: string,
  storeId: string,
): Promise<void> {
  const { error } = await client.rpc('rpc_soft_delete_purchase', {
    p_purchase_id: purchaseId,
    p_store_id: storeId,
  });
  if (error) throw mapSupabaseError(error);
}
