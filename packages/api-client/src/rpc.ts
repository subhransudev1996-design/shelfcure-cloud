import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

// ============================================================================
// Onboarding
// ============================================================================

export async function rpcCreateOrgWithOwner(
  client: Client,
  input: { orgName: string; fullName: string; phone?: string | null },
): Promise<{ orgId: string; profileId: string }> {
  const { data, error } = await client.rpc('rpc_create_org_with_owner', {
    p_org_name: input.orgName,
    p_full_name: input.fullName,
    p_phone: input.phone ?? undefined,
  });

  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.org_id || !row.profile_id) {
    throw mapSupabaseError(new Error('rpc_create_org_with_owner returned no row'));
  }
  return { orgId: row.org_id, profileId: row.profile_id };
}

// ============================================================================
// Sales
// ============================================================================

export interface SaleLineItem {
  // Regular line (medicine + batch required)
  medicine_id?: string;
  batch_id?: string;
  quantity: number;
  selling_unit?: 'pack' | 'unit';
  mrp: number;
  discount_percentage?: number;
  item_discount_type?: 'percentage' | 'flat';
  item_discount_value?: number;
  gst_percentage: number;
  taxable_amount: number;
  cgst_percentage?: number;
  sgst_percentage?: number;
  igst_percentage?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  amount: number;
  // Misc line (medicine_id + batch_id must be NULL)
  is_misc_item?: boolean;
  misc_note?: string;
}

export interface SalePayment {
  payment_method: 'cash' | 'card' | 'upi' | 'wallet' | 'credit' | 'bank_transfer' | 'cheque' | 'other';
  amount: number;
  reference_number?: string;
}

export interface CommitSaleInput {
  client_uuid: string;
  store_id: string;
  bill_number: string;
  bill_date?: string;
  customer_id?: string | null;
  doctor_id?: string | null;
  customer_type?: 'b2c' | 'b2b';
  customer_gstin?: string | null;
  customer_state?: string | null;
  doctor_name?: string | null;
  prescription_image_path?: string | null;
  is_prescription_sale?: boolean;
  subtotal?: number;
  taxable_amount?: number;
  gst_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  discount_amount?: number;
  special_discount_amount?: number;
  special_discount_label?: string | null;
  misc_charge?: number;
  round_off?: number;
  total_amount: number;
  payment_method?: string;
  payment_status?: 'paid' | 'partial' | 'pending' | 'credit';
  paid_amount?: number;
  source?: 'web' | 'desktop' | 'mobile' | 'api';
  notes?: string | null;
  items: SaleLineItem[];
  payments: SalePayment[];
}

export async function rpcCommitSale(
  client: Client,
  input: CommitSaleInput,
): Promise<{ saleId: string; billNumber: string }> {
  const { data, error } = await client.rpc('rpc_commit_sale', { p_payload: input as never });
  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.sale_id) throw mapSupabaseError(new Error('rpc_commit_sale returned no row'));
  return { saleId: row.sale_id, billNumber: row.bill_number };
}

// ============================================================================
// Sale returns
// ============================================================================

export interface SaleReturnLine {
  sale_item_id: string;
  medicine_id: string;
  batch_id: string;
  quantity: number;
  amount: number;
}

export interface CommitSaleReturnInput {
  client_uuid: string;
  store_id: string;
  sale_id: string;
  customer_id?: string | null;
  return_number: string;
  return_date?: string;
  subtotal?: number;
  gst_amount?: number;
  total_amount: number;
  reason?: string;
  refund_method?: 'cash' | 'card' | 'upi' | 'wallet' | 'credit_note' | 'bank_transfer' | 'other';
  items: SaleReturnLine[];
}

export async function rpcCommitSaleReturn(
  client: Client,
  input: CommitSaleReturnInput,
): Promise<{ returnId: string; returnNumber: string }> {
  const { data, error } = await client.rpc('rpc_commit_sale_return', { p_payload: input as never });
  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.return_id) throw mapSupabaseError(new Error('rpc_commit_sale_return returned no row'));
  return { returnId: row.return_id, returnNumber: row.return_number };
}

// ============================================================================
// Purchases
// ============================================================================

export interface PurchaseLineItem {
  medicine_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  free_quantity?: number;
  purchase_rate: number;
  mrp: number;
  selling_price?: number;
  gst_percentage: number;
  discount_percentage?: number;
  amount: number;
}

export interface CommitPurchaseInput {
  client_uuid: string;
  store_id: string;
  supplier_id: string;
  bill_number: string;
  bill_date?: string;
  bill_image_url?: string | null;
  subtotal?: number;
  taxable_amount?: number;
  gst_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  discount_amount?: number;
  total_amount: number;
  payment_status?: 'pending' | 'partial' | 'paid';
  paid_amount?: number;
  payment_method?: string;
  payment_date?: string;
  is_ai_scanned?: boolean;
  notes?: string;
  items: PurchaseLineItem[];
}

export async function rpcCommitPurchase(
  client: Client,
  input: CommitPurchaseInput,
): Promise<{ purchaseId: string; billNumber: string }> {
  const { data, error } = await client.rpc('rpc_commit_purchase', { p_payload: input as never });
  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.purchase_id) throw mapSupabaseError(new Error('rpc_commit_purchase returned no row'));
  return { purchaseId: row.purchase_id, billNumber: row.bill_number };
}

export interface PurchaseReturnLine {
  purchase_item_id: string;
  medicine_id: string;
  batch_id: string;
  quantity: number;
  amount: number;
}

export interface CommitPurchaseReturnInput {
  client_uuid: string;
  store_id: string;
  purchase_id: string;
  supplier_id: string;
  return_number: string;
  return_date?: string;
  subtotal?: number;
  gst_amount?: number;
  total_amount: number;
  reason?: string;
  items: PurchaseReturnLine[];
}

export async function rpcCommitPurchaseReturn(
  client: Client,
  input: CommitPurchaseReturnInput,
): Promise<{ returnId: string; returnNumber: string }> {
  const { data, error } = await client.rpc('rpc_commit_purchase_return', { p_payload: input as never });
  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.return_id) throw mapSupabaseError(new Error('rpc_commit_purchase_return returned no row'));
  return { returnId: row.return_id, returnNumber: row.return_number };
}

// ============================================================================
// Stock transfers
// ============================================================================

export interface TransferRequestLine {
  source_batch_id: string;
  requested_quantity: number;
  notes?: string;
}

export interface StockTransferRequestInput {
  client_uuid: string;
  from_store_id: string;
  to_store_id: string;
  transfer_no: string;
  flow?: 'immediate' | 'request_approve';
  notes?: string;
  items: TransferRequestLine[];
}

export async function rpcStockTransferRequest(
  client: Client,
  input: StockTransferRequestInput,
): Promise<{ transferId: string; transferNo: string }> {
  const { data, error } = await client.rpc('rpc_stock_transfer_request', { p_payload: input as never });
  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.transfer_id) throw mapSupabaseError(new Error('rpc_stock_transfer_request returned no row'));
  return { transferId: row.transfer_id, transferNo: row.transfer_no };
}

export interface TransferApproval {
  item_id: string;
  approved_quantity: number;
}

export async function rpcStockTransferApprove(
  client: Client,
  transferId: string,
  approvals: TransferApproval[],
): Promise<void> {
  const { error } = await client.rpc('rpc_stock_transfer_approve', {
    p_transfer_id: transferId,
    p_approvals: approvals as never,
  });
  if (error) throw mapSupabaseError(error);
}

export interface TransferReceipt {
  item_id: string;
  received_quantity: number;
}

export async function rpcStockTransferReceive(
  client: Client,
  transferId: string,
  receipts: TransferReceipt[],
): Promise<void> {
  const { error } = await client.rpc('rpc_stock_transfer_receive', {
    p_transfer_id: transferId,
    p_receipts: receipts as never,
  });
  if (error) throw mapSupabaseError(error);
}

// ============================================================================
// Stock corrections
// ============================================================================

export async function rpcStockCorrection(
  client: Client,
  input: { batchId: string; delta: number; reason: string; clientUuid?: string },
): Promise<string> {
  const { data, error } = await client.rpc('rpc_stock_correction', {
    p_batch_id: input.batchId,
    p_delta: input.delta,
    p_reason: input.reason,
    p_client_uuid: input.clientUuid,
  });
  if (error) throw mapSupabaseError(error);
  if (!data) throw mapSupabaseError(new Error('rpc_stock_correction returned no id'));
  return data as string;
}
