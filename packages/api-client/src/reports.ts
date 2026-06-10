import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

export interface SalesTrendDay {
  day: string;
  bill_count: number;
  total_amount: number;
  gst_amount: number;
}

export async function reportSalesTrend(client: Client, storeId: string, days = 30): Promise<SalesTrendDay[]> {
  const { data, error } = await client.rpc('rpc_report_sales_trend', { p_store_id: storeId, p_days: days });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as SalesTrendDay[];
}

export interface TopMedicineRow {
  medicine_id: string;
  name: string;
  manufacturer: string;
  qty_sold: number;
  revenue: number;
  bills: number;
}

export async function reportTopMedicines(
  client: Client,
  storeId: string,
  days = 30,
  limit = 10,
): Promise<TopMedicineRow[]> {
  const { data, error } = await client.rpc('rpc_report_top_medicines', {
    p_store_id: storeId,
    p_days: days,
    p_limit: limit,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as TopMedicineRow[];
}

export interface GstSlabRow {
  gst_rate: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  line_count: number;
}

export async function reportGstSummary(
  client: Client,
  storeId: string,
  from?: string,
  to?: string,
): Promise<GstSlabRow[]> {
  const { data, error } = await client.rpc('rpc_report_gst_summary', {
    p_store_id: storeId,
    p_from: from ?? undefined,
    p_to: to ?? undefined,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as GstSlabRow[];
}
