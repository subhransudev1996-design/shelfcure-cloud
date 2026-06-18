import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

// ── Existing RPCs (kept for backwards compat / dashboard widget) ─────────────

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

// ── New §2.11 report functions ────────────────────────────────────────────────

export interface ExpiryReportRow {
  batch_id: string;
  batch_number: string;
  medicine_id: string;
  medicine_name: string;
  manufacturer: string;
  supplier_id: string | null;
  supplier_name: string | null;
  expiry_date: string;
  current_quantity: number;
  purchase_rate: number;
  mrp: number;
  gst_percentage: number;
  sale_unit_mode: string;
  units_per_pack: number;
  pack_unit: string;
  days_to_expiry: number;
  is_expired: boolean;
  value_at_mrp: number;
}

export async function reportExpiry(
  client: Client,
  storeId: string,
  daysAhead = 90,
): Promise<ExpiryReportRow[]> {
  const { data, error } = await client.rpc('rpc_report_expiry', {
    p_store_id: storeId,
    p_days_ahead: daysAhead,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as ExpiryReportRow[];
}

export interface ShortageReportRow {
  medicine_id: string;
  medicine_name: string;
  manufacturer: string;
  current_quantity: number;
  min_stock_level: number;
  reorder_level: number;
  sale_unit_mode: string;
  units_per_pack: number;
  pack_unit: string;
  is_out_of_stock: boolean;
  shortage_qty: number;
  primary_supplier_id: string | null;
  primary_supplier_name: string;
  last_purchase_date: string | null;
  last_purchase_rate: number | null;
  estimated_reorder_value: number;
}

export async function reportShortage(client: Client, storeId: string): Promise<ShortageReportRow[]> {
  const { data, error } = await client.rpc('rpc_report_shortage', { p_store_id: storeId });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as ShortageReportRow[];
}

export interface StockSummaryRow {
  medicine_id: string;
  medicine_name: string;
  manufacturer: string;
  sale_unit_mode: string;
  units_per_pack: number;
  pack_unit: string;
  min_stock_level: number;
  reorder_level: number;
  total_quantity: number;
  active_batches: number;
  nearest_expiry: string | null;
  stock_value: number;
  is_low_stock: boolean;
}

export async function reportStockSummary(client: Client, storeId: string): Promise<StockSummaryRow[]> {
  const { data, error } = await client.rpc('rpc_report_stock_summary', { p_store_id: storeId });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as StockSummaryRow[];
}

export type GstMonthlyReport = {
  period: { month: number; year: number; from: string; to: string };
  output: {
    taxable: number; cgst: number; sgst: number; igst: number; total_gst: number;
    slabs: Array<{ gst_rate: number; transactions: number; taxable_amount: number; cgst: number; sgst: number; igst: number; total_gst: number }>;
  };
  input: {
    taxable: number; cgst: number; sgst: number; igst: number; total_gst: number;
    slabs: Array<{ gst_rate: number; transactions: number; taxable_amount: number; cgst: number; sgst: number; igst: number; total_gst: number }>;
  };
  sr_gst: number;
  sr_taxable: number;
  pr_gst: number;
  pr_taxable: number;
  net_output_gst: number;
  net_itc: number;
  net_payable: number;
};

export async function reportGstMonthly(
  client: Client,
  storeId: string,
  month: number,
  year: number,
): Promise<GstMonthlyReport> {
  const { data, error } = await client.rpc('rpc_report_gst_monthly', {
    p_store_id: storeId,
    p_month: month,
    p_year: year,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as GstMonthlyReport;
}

export type DoctorReportData = {
  period: { from: string; to: string };
  total_sales: number;
  prescription_count: number;
  prescription_revenue: number;
  prescription_share: number;
  total_commission_earned: number;
  total_gross_profit: number;
  total_net_profit: number;
  doctors: Array<{
    doctor_id: string;
    doctor_name: string;
    commission_type: string;
    commission_rate: number;
    sale_count: number;
    revenue: number;
    gross_profit: number;
    commission_earned: number;
    net_profit: number;
  }>;
};

export async function reportDoctors(
  client: Client,
  storeId: string,
  from?: string,
  to?: string,
): Promise<DoctorReportData> {
  const { data, error } = await client.rpc('rpc_report_doctors', {
    p_store_id: storeId,
    p_from: from ?? null,
    p_to: to ?? null,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as DoctorReportData;
}

export type DailyReportData = {
  period: { from: string; to: string };
  bill_count: number;
  gross_sales: number;
  total_paid: number;
  total_gst: number;
  cgst: number;
  sgst: number;
  igst: number;
  customer_count: number;
  credit_extended: number;
  avg_bill_value: number;
  returns_count: number;
  returns_total: number;
  net_sales: number;
  gross_profit: number;
  expenses_total: number;
  net_profit: number;
  purchases_count: number;
  purchases_total: number;
  customer_payments_total: number;
  top_medicines: TopMedicineRow[];
  daily_breakdown: Array<{ day: string; bill_count: number; gross_sales: number; returns_total: number; net_sales: number }>;
  payments: Array<{ method: string; amount: number; cnt: number }>;
};

export async function reportDaily(
  client: Client,
  storeId: string,
  from: string,
  to: string,
): Promise<DailyReportData> {
  const { data, error } = await client.rpc('rpc_report_daily', {
    p_store_id: storeId,
    p_from: from,
    p_to: to,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as DailyReportData;
}

// ── §2.11.1 Overall Performance ───────────────────────────────────────────────

export type PerfPeriodType = 'today' | 'week' | 'month' | 'quarter' | '30d' | 'all';

export interface GrowthKpi<T = number> {
  current: T;
  previous: T;
  delta_abs: T;
  delta_pct: number;
}

export interface OverallPerformanceReport {
  period: {
    type: PerfPeriodType;
    current_from: string;
    current_to: string;
    previous_from: string | null;
    previous_to: string | null;
  };
  kpis: {
    revenue: GrowthKpi;
    bills: GrowthKpi;
    avg_bill_value: GrowthKpi;
    items_sold: GrowthKpi;
    active_customers: GrowthKpi;
    new_customers: GrowthKpi;
    gross_profit: GrowthKpi;
    net_profit: GrowthKpi;
    gross_margin_pct: GrowthKpi;
    net_margin_pct: GrowthKpi;
  };
  inventory: {
    total_skus: number;
    stock_value: number;
    low_stock_count: number;
    near_expiry_count: number;
    expired_count: number;
    dormant_skus: number;
  };
  credit: {
    total_outstanding: number;
    customers_with_balance: number;
    aging_0_30: number;
    aging_31_60: number;
    aging_61_90: number;
    aging_90_plus: number;
  };
}

export async function reportOverallPerformance(
  client: Client,
  storeId: string,
  periodType: PerfPeriodType = 'month',
): Promise<OverallPerformanceReport> {
  const { data, error } = await client.rpc('rpc_report_overall_performance', {
    p_store_id: storeId,
    p_period_type: periodType,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as OverallPerformanceReport;
}

// ── §2.11.3 Profit Tracking ───────────────────────────────────────────────────

export interface ProfitDailyRow {
  day: string;
  bills: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
}

export interface ProfitManufacturerRow {
  manufacturer: string;
  skus: number;
  revenue: number;
  cogs: number;
  profit: number;
  margin_pct: number;
}

export interface ProfitTrackingReport {
  period: {
    from: string;
    to: string;
    days: number;
    previous_from: string;
    previous_to: string;
  };
  kpis: {
    net_sales: GrowthKpi;
    bills: GrowthKpi;
    gross_profit: GrowthKpi;
    net_profit: GrowthKpi;
    gross_margin_pct: GrowthKpi;
    net_margin_pct: GrowthKpi;
  };
  gross_sales: number;
  returns_total: number;
  revenue: number;
  cogs: number;
  bill_discounts: number;
  expenses_total: number;
  avg_profit_per_day: number;
  daily: ProfitDailyRow[];
  top_earners: ProfitManufacturerRow[];
  loss_makers: ProfitManufacturerRow[];
}

export async function reportProfitTracking(
  client: Client,
  storeId: string,
  from: string,
  to: string,
): Promise<ProfitTrackingReport> {
  const { data, error } = await client.rpc('rpc_report_profit_tracking', {
    p_store_id: storeId,
    p_from: from,
    p_to: to,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as ProfitTrackingReport;
}

export interface CashCreditDailyRow {
  day: string;
  cash_amount: number;
  cash_count: number;
  credit_amount: number;
  credit_count: number;
}

export interface CashCreditDebtorRow {
  customer_id: string;
  customer: string;
  phone: string | null;
  outstanding: number;
  last_sale_date: string | null;
  days_since_last_sale: number | null;
}

export interface CashCreditBillRow {
  sale_id: string;
  bill_number: string;
  bill_date: string;
  customer: string;
  total: number;
  paid: number;
  balance: number;
  payment_status: string;
}

export interface CashCreditReport {
  period: { from: string; to: string };
  cash_sales_amount: number;
  cash_sales_count: number;
  credit_sales_total: number;
  credit_sales_count: number;
  credit_unpaid_portion: number;
  credit_collected: number;
  snapshot: {
    total_outstanding: number;
    customers_with_balance: number;
    aging_0_30: number;
    aging_31_60: number;
    aging_61_90: number;
    aging_90_plus: number;
  };
  daily: CashCreditDailyRow[];
  top_debtors: CashCreditDebtorRow[];
  credit_bills: CashCreditBillRow[];
}

export async function reportCashCredit(
  client: Client,
  storeId: string,
  from: string,
  to: string,
): Promise<CashCreditReport> {
  const { data, error } = await client.rpc('rpc_report_cash_credit', {
    p_store_id: storeId,
    p_from: from,
    p_to: to,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as CashCreditReport;
}
