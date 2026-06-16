import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

export interface ChallanRecord {
  id: string;
  supplier_id: string;
  supplier_name: string | null;
  challan_number: string;
  challan_date: string;
  expected_return_date: string | null;
  status: 'pending' | 'accepted' | 'partially_accepted' | 'returned' | 'expired';
  linked_purchase_id: string | null;
  total_items: number;
  total_quantity: number;
  notes: string | null;
  created_at: string;
}

export interface ChallanItemRecord {
  id: string;
  challan_id: string;
  medicine_id: string;
  medicine_name: string | null;
  batch_number: string;
  expiry_date: string;
  received_quantity: number;
  accepted_quantity: number;
  returned_quantity: number;
  purchase_rate: number;
  mrp: number;
  gst_percentage: number;
  status: 'pending' | 'accepted' | 'returned' | 'partial';
  current_stock: number;
  sold_quantity: number;
  returnable_quantity: number;
  received_units: number;
  sale_unit_mode: string;
  units_per_pack: number;
}

export interface ChallanDetail {
  challan: ChallanRecord & { store_id: string; org_id: string; updated_at: string };
  items: ChallanItemRecord[];
}

export interface CreateChallanItem {
  medicine_id: string;
  batch_number?: string;
  expiry_date?: string;
  received_quantity: number;
  purchase_rate: number;
  mrp: number;
  gst_percentage: number;
}

export interface CreateChallanInput {
  store_id: string;
  supplier_id: string;
  challan_number: string;
  challan_date: string;
  expected_return_date?: string | null;
  notes?: string | null;
  items: CreateChallanItem[];
}

export interface AcceptChallanItem {
  challan_item_id: string;
  accepted_quantity: number;
}

export interface AcceptChallanInput {
  store_id: string;
  challan_id: string;
  payment_status: 'paid' | 'pending' | 'partial';
  paid_amount: number;
  payment_method?: string | null;
  items: AcceptChallanItem[];
}

export interface ReturnChallanResult {
  returned_quantity: number;
  auto_accepted_quantity: number;
  status: string;
}

export async function listChallans(
  client: Client,
  storeId: string,
  status?: string | null,
  supplierId?: string | null,
): Promise<ChallanRecord[]> {
  const { data, error } = await client.rpc('rpc_list_challans', {
    p_store_id: storeId,
    p_status: status ?? null,
    p_supplier_id: supplierId ?? null,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as ChallanRecord[];
}

export async function getChallanDetail(client: Client, challanId: string): Promise<ChallanDetail> {
  const { data, error } = await client.rpc('rpc_get_challan_detail', {
    p_challan_id: challanId,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as ChallanDetail;
}

export async function createChallan(client: Client, input: CreateChallanInput): Promise<string> {
  const { data, error } = await client.rpc('rpc_create_challan', {
    p_payload: input as unknown as Database['public']['Functions']['rpc_create_challan']['Args']['p_payload'],
  });
  if (error) throw mapSupabaseError(error);
  return data as string;
}

export async function acceptChallan(
  client: Client,
  input: AcceptChallanInput,
): Promise<{ purchase_id: string | null }> {
  const { data, error } = await client.rpc('rpc_accept_challan', {
    p_payload: input as unknown as Database['public']['Functions']['rpc_accept_challan']['Args']['p_payload'],
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as { purchase_id: string | null };
}

export async function returnChallan(
  client: Client,
  challanId: string,
  storeId: string,
): Promise<ReturnChallanResult> {
  const { data, error } = await client.rpc('rpc_return_challan', {
    p_challan_id: challanId,
    p_store_id: storeId,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as ReturnChallanResult;
}

export async function getPendingChallanCount(client: Client, storeId: string): Promise<number> {
  const { data, error } = await client.rpc('rpc_pending_challan_count', {
    p_store_id: storeId,
  });
  if (error) throw mapSupabaseError(error);
  return (data as number) ?? 0;
}
