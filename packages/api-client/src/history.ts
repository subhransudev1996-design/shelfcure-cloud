import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

export interface SaleListRow {
  id: string;
  bill_number: string;
  bill_date: string;
  customer_id: string | null;
  customer_name: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  is_returned: boolean;
  created_at: string;
  created_by_name: string;
}

export async function listSales(
  client: Client,
  opts: { storeId: string; from?: string; to?: string; limit?: number; offset?: number },
): Promise<SaleListRow[]> {
  const { data, error } = await client.rpc('rpc_list_sales', {
    p_store_id: opts.storeId,
    p_from: opts.from ?? undefined,
    p_to: opts.to ?? undefined,
    p_limit: opts.limit ?? 50,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as SaleListRow[];
}

export interface SaleDetail {
  sale: Record<string, unknown> & {
    id: string;
    bill_number: string;
    bill_date: string;
    customer_id: string | null;
    customer_name: string;
    customer_phone: string | null;
    customer_address: string | null;
    customer_gstin: string | null;
    customer_state: string | null;
    store_name: string;
    store_code: string;
    store_address: string | null;
    store_city: string | null;
    store_state: string | null;
    store_pincode: string | null;
    store_phone: string | null;
    store_email: string | null;
    store_gstin: string | null;
    store_drug_license: string | null;
    store_upi_vpa: string | null;
    org_name: string | null;
    org_gstin: string | null;
    is_prescription_sale: boolean | null;
    doctor_id: string | null;
    doctor_name_resolved: string | null;
    doctor_specialization: string | null;
    prescription_image_path: string | null;
    created_by_name: string;
    subtotal: number;
    gst_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    discount_amount: number;
    special_discount_amount: number | null;
    special_discount_label: string | null;
    misc_charge: number | null;
    round_off: number;
    total_amount: number;
    payment_method: string;
    payment_status: string;
    paid_amount: number;
  };
  items: Array<{
    id: string;
    medicine_id: string | null;
    medicine_name: string;
    batch_number: string | null;
    expiry_date: string | null;
    hsn_code: string | null;
    quantity: number;
    mrp: number;
    gst_percentage: number;
    taxable_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    amount: number;
    is_misc_item: boolean;
    misc_note: string | null;
  }>;
  payments: Array<{
    payment_method: string;
    amount: number;
    reference_number: string | null;
  }>;
}

export async function updateStoreUpi(
  client: Client,
  storeId: string,
  vpa: string | null,
): Promise<string | null> {
  const { data, error } = await client.rpc('rpc_update_store_upi', {
    p_store_id: storeId,
    p_vpa: vpa ?? '',
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? null) as string | null;
}

export async function getSaleDetail(client: Client, saleId: string): Promise<SaleDetail> {
  const { data, error } = await client.rpc('rpc_get_sale_detail', { p_sale_id: saleId });
  if (error) throw mapSupabaseError(error);
  return data as unknown as SaleDetail;
}

// ============================================================================
// Dashboard
// ============================================================================

export interface DashboardSummary {
  today_sale_count: number;
  today_sale_total: number;
  today_gst_collected: number;
  month_sale_count: number;
  month_sale_total: number;
  low_stock_count: number;
  expiring_soon_count: number;
  store_count: number;
}

export async function getDashboardSummary(client: Client, storeId?: string | null): Promise<DashboardSummary> {
  const { data, error } = await client.rpc('rpc_dashboard_summary', { p_store_id: storeId ?? undefined });
  if (error) throw mapSupabaseError(error);
  return data as unknown as DashboardSummary;
}

export interface LowStockRow {
  medicine_id: string;
  name: string;
  manufacturer: string;
  on_hand: number;
  min_level: number;
}

export async function getLowStockAlerts(client: Client, storeId: string, limit = 10): Promise<LowStockRow[]> {
  const { data, error } = await client.rpc('rpc_low_stock_alerts', { p_store_id: storeId, p_limit: limit });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as LowStockRow[];
}

// ─── Full dashboard stats (§2.1) ─────────────────────────────────────────────

export interface DashboardStats {
  today_sale_count: number;
  today_sales: number;
  today_gst_collected: number;
  today_purchases: number;
  today_returns: number;
  today_profit: number;
  month_sale_count: number;
  monthly_sales: number;
  monthly_returns: number;
  monthly_profit: number;
  total_medicines: number;
  total_stock_value: number;
  low_stock_count: number;
  expiry_soon_count: number;
  expired_count: number;
  outstanding_credit: number;
  store_count: number;
}

export async function getDashboardStats(client: Client, storeId: string): Promise<DashboardStats> {
  const { data, error } = await client.rpc('rpc_dashboard_stats', { p_store_id: storeId });
  if (error) throw mapSupabaseError(error);
  return data as unknown as DashboardStats;
}

export interface ChartDataPoint {
  day: string;
  sales: number;
  purchases: number;
  returns: number;
}

export async function getDashboardChartData(
  client: Client,
  storeId: string,
  days = 14,
): Promise<ChartDataPoint[]> {
  const { data, error } = await client.rpc('rpc_dashboard_chart_data', {
    p_store_id: storeId,
    p_days: days,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as ChartDataPoint[];
}

export interface UpcomingRefillRow {
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  medicine_id: string;
  medicine_name: string;
  sale_unit_mode: string;
  units_per_pack: number | null;
  interval_days: number | null;
  remind_days_before: number;
  last_dispensed_date: string | null;
  next_due_date: string | null;
  days_until_due: number | null;
  total_stock: number;
  min_stock_level: number;
}

export async function getUpcomingRefills(
  client: Client,
  storeId: string,
  days = 7,
): Promise<UpcomingRefillRow[]> {
  const { data, error } = await client.rpc('rpc_upcoming_refills', {
    p_store_id: storeId,
    p_days: days,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as UpcomingRefillRow[];
}

export interface ExpiringBatchRow {
  batch_id: string;
  medicine_id: string;
  medicine_name: string;
  batch_number: string;
  expiry_date: string;
  on_hand: number;
  days_left: number;
}

export async function getExpiringBatches(
  client: Client,
  storeId: string,
  days = 90,
  limit = 10,
): Promise<ExpiringBatchRow[]> {
  const { data, error } = await client.rpc('rpc_expiring_batches', {
    p_store_id: storeId,
    p_days: days,
    p_limit: limit,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as ExpiringBatchRow[];
}
