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
    b2b_taxable: number; b2c_taxable: number;
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

export interface GstAnnualMonthRow {
  month: string;
  out_total_gst: number;
  in_total_gst: number;
  net_payable: number;
}

export interface GstAnnualReport {
  fin_year: number;
  period: { from: string; to: string };
  out_taxable: number; out_cgst: number; out_sgst: number; out_igst: number; out_total_gst: number;
  out_b2b_taxable: number; out_b2c_taxable: number;
  in_taxable: number; in_cgst: number; in_sgst: number; in_igst: number; in_total_gst: number;
  sr_gst: number; sr_taxable: number;
  pr_gst: number; pr_taxable: number;
  net_output_gst: number; net_itc: number; net_payable: number;
  monthly_rows: GstAnnualMonthRow[];
}

export async function reportGstAnnual(
  client: Client,
  storeId: string,
  finYear: number,
): Promise<GstAnnualReport> {
  const { data, error } = await client.rpc('rpc_report_gst_annual', {
    p_store_id: storeId,
    p_fin_year: finYear,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as GstAnnualReport;
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

export interface DailyCollectionRow {
  date: string;
  cash: number;
  upi: number;
  card: number;
  other: number;
  credit_pending: number;
  total_collected: number;
  bill_count: number;
}

export interface DailyCollectionReport {
  period: { from: string; to: string };
  rows: DailyCollectionRow[];
  totals: {
    total_cash: number;
    total_upi: number;
    total_card: number;
    total_other: number;
    total_credit_pending: number;
    total_collected: number;
    total_bills: number;
  };
}

export async function reportDailyCollection(
  client: Client,
  storeId: string,
  from: string,
  to: string,
): Promise<DailyCollectionReport> {
  const { data, error } = await client.rpc('rpc_report_daily_collection', {
    p_store_id: storeId,
    p_from: from,
    p_to: to,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as DailyCollectionReport;
}

export interface HourlyBucket {
  hour: number;
  bill_count: number;
  revenue: number;
  items_sold: number;
}

export interface HourlyHeatmapCell {
  date: string;
  hour: number;
  revenue: number;
  bill_count: number;
}

export interface HourlyReport {
  period: { from: string; to: string };
  hourly: HourlyBucket[];
  heatmap: HourlyHeatmapCell[];
  summary: {
    total_bills: number;
    total_revenue: number;
    total_items: number;
    peak_hour: number;
    peak_hour_revenue: number;
    avg_bills_per_active_hour: number;
  };
}

export async function reportHourly(
  client: Client,
  storeId: string,
  from: string,
  to: string,
): Promise<HourlyReport> {
  const { data, error } = await client.rpc('rpc_report_hourly', {
    p_store_id: storeId,
    p_from: from,
    p_to: to,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as HourlyReport;
}

export interface GrowthTrendMonth {
  label: string;
  period_start: string;
  period_end: string;
  revenue: number;
  bills: number;
}

export interface GrowthTrendMedicineRow {
  medicine_id: string;
  name: string;
  manufacturer: string | null;
  cur_rev: number;
  prev_rev: number;
  cur_qty: number;
  prev_qty: number;
  rev_delta: number;
}

export interface GrowthTrendReport {
  period: {
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
  };
  trend: GrowthTrendMonth[];
  growers: GrowthTrendMedicineRow[];
  decliners: GrowthTrendMedicineRow[];
}

export async function reportGrowthTrend(
  client: Client,
  storeId: string,
  periodType: PerfPeriodType,
): Promise<GrowthTrendReport> {
  const { data, error } = await client.rpc('rpc_report_growth_trend', {
    p_store_id: storeId,
    p_period_type: periodType,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as GrowthTrendReport;
}

export interface StockMovementRow {
  medicine_id: string;
  name: string;
  manufacturer: string | null;
  sale_unit_mode: string;
  units_per_pack: number;
  pack_unit: string;
  current_stock: number;
  purchased_in: number;
  purchased_value: number;
  sale_returned_in: number;
  sold_out: number;
  sold_value: number;
  purchase_returned_out: number;
  net_change: number;
}

export interface StockMovementReport {
  period: { from: string; to: string };
  summary: {
    qty_in: number;
    qty_out: number;
    net_change: number;
    skus_moved: number;
    dormant_in_stock: number;
  };
  rows: StockMovementRow[];
}

export async function reportStockMovement(
  client: Client,
  storeId: string,
  from: string,
  to: string,
): Promise<StockMovementReport> {
  const { data, error } = await client.rpc('rpc_report_stock_movement', {
    p_store_id: storeId,
    p_from: from,
    p_to: to,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as StockMovementReport;
}

export type VelocityClassification = 'fast' | 'steady' | 'slow' | 'dead';

export interface StockVelocityRow {
  medicine_id: string;
  name: string;
  manufacturer: string | null;
  sale_unit_mode: string;
  units_per_pack: number | null;
  pack_unit: string;
  current_stock: number;
  stock_value: number;
  sold_in_window: number;
  sold_30d: number;
  velocity_per_day: number;
  days_of_cover: number | null;
  days_since_last_sale: number | null;
  classification: VelocityClassification;
}

export interface StockVelocityReport {
  window_days: number;
  summary: {
    total_skus: number;
    fast_count: number;
    steady_count: number;
    slow_count: number;
    dead_count: number;
    stock_value_at_risk: number;
    total_stock_value: number;
  };
  rows: StockVelocityRow[];
}

export async function reportStockVelocity(
  client: Client,
  storeId: string,
  windowDays: number,
): Promise<StockVelocityReport> {
  const { data, error } = await client.rpc('rpc_report_stock_velocity', {
    p_store_id: storeId,
    p_window_days: windowDays,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as StockVelocityReport;
}
