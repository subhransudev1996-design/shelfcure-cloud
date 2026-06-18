import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import {
  reportOverallPerformance,
  type OverallPerformanceReport,
  type PerfPeriodType,
} from '@shelfcure/api-client';
import { KpiCard } from '../kpi-delta';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const INR0 = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PERIODS: Array<{ value: PerfPeriodType; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'all', label: 'All Time' },
];

export default async function PerformanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const periodType = (PERIODS.some((p) => p.value === sp.period) ? sp.period : 'month') as PerfPeriodType;

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const data = await reportOverallPerformance(supabase, storeId, periodType).catch(
    () => null as OverallPerformanceReport | null,
  );

  const suppress = periodType === 'all';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-violet-600"><path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2Zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 0-2 2h-2a2 2 0 0 0-2-2Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">Overall Performance</h1>
          <p className="text-xs text-zinc-400">Health score, KPIs, inventory & credit health at a glance</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={`/dashboard/reports/performance?period=${p.value}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                periodType === p.value ? 'bg-violet-50 text-violet-800' : 'text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="py-16 text-center text-sm text-zinc-500">Failed to load performance data.</div>
      ) : (
        <>
          <p className="text-xs text-zinc-400">
            {fmtDate(data.period.current_from)} → {fmtDate(data.period.current_to)}
            {!suppress && data.period.previous_from && (
              <> · compared to {fmtDate(data.period.previous_from)} → {fmtDate(data.period.previous_to!)}</>
            )}
          </p>

          {/* P&L KPIs */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">Sales &amp; Profit</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Revenue" kpi={data.kpis.revenue} format={INR} suppress={suppress} tone="text-emerald-700" />
              <KpiCard label="Bills" kpi={data.kpis.bills} format={(n) => String(n)} suppress={suppress} />
              <KpiCard label="Avg Bill Value" kpi={data.kpis.avg_bill_value} format={INR} suppress={suppress} />
              <KpiCard label="Items Sold" kpi={data.kpis.items_sold} format={(n) => String(n)} suppress={suppress} />
              <KpiCard label="Gross Profit" kpi={data.kpis.gross_profit} format={INR} suppress={suppress} tone="text-indigo-700" />
              <KpiCard label="Net Profit" kpi={data.kpis.net_profit} format={INR} suppress={suppress} tone={Number(data.kpis.net_profit.current) >= 0 ? 'text-green-700' : 'text-red-700'} />
              <KpiCard label="Gross Margin" kpi={data.kpis.gross_margin_pct} format={(n) => `${n.toFixed(1)}%`} suppress={suppress} />
              <KpiCard label="Net Margin" kpi={data.kpis.net_margin_pct} format={(n) => `${n.toFixed(1)}%`} suppress={suppress} />
            </div>
          </div>

          {/* Customer KPIs */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">Customers</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Active Customers" kpi={data.kpis.active_customers} format={(n) => String(n)} suppress={suppress} />
              <KpiCard label="New Customers" kpi={data.kpis.new_customers} format={(n) => String(n)} suppress={suppress} tone="text-blue-700" />
            </div>
          </div>

          {/* Inventory health */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">Inventory Health</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                { label: 'Total SKUs', value: String(data.inventory.total_skus), cls: 'text-zinc-900', href: '/dashboard/inventory' },
                { label: 'Stock Value', value: INR0(data.inventory.stock_value), cls: 'text-emerald-700', href: '/dashboard/reports/stock' },
                { label: 'Low Stock', value: String(data.inventory.low_stock_count), cls: data.inventory.low_stock_count > 0 ? 'text-orange-700' : 'text-zinc-900', href: '/dashboard/reports/shortage' },
                { label: 'Near Expiry', value: String(data.inventory.near_expiry_count), cls: data.inventory.near_expiry_count > 0 ? 'text-amber-700' : 'text-zinc-900', href: '/dashboard/reports/expiry' },
                { label: 'Expired (in stock)', value: String(data.inventory.expired_count), cls: data.inventory.expired_count > 0 ? 'text-red-700' : 'text-zinc-900', href: '/dashboard/reports/expiry' },
                { label: 'Dormant SKUs (90d)', value: String(data.inventory.dormant_skus), cls: 'text-zinc-700', href: '/dashboard/inventory' },
              ].map((c) => (
                <Link key={c.label} href={c.href} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-violet-300">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
                  <p className={`mt-1 text-lg font-black tabular-nums ${c.cls}`}>{c.value}</p>
                </Link>
              ))}
            </div>
          </div>

          {/* Credit health */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">Credit Health</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Total Outstanding</p>
                  <p className="mt-1 text-xl font-black tabular-nums text-amber-700">{INR(data.credit.total_outstanding)}</p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Customers with Balance</p>
                  <p className="mt-1 text-xl font-black tabular-nums text-zinc-900">{data.credit.customers_with_balance}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Aging (unpaid sales)</p>
                <div className="space-y-2">
                  {[
                    { label: '0–30 days', value: data.credit.aging_0_30, cls: 'bg-emerald-400' },
                    { label: '31–60 days', value: data.credit.aging_31_60, cls: 'bg-amber-400' },
                    { label: '61–90 days', value: data.credit.aging_61_90, cls: 'bg-orange-400' },
                    { label: '90+ days', value: data.credit.aging_90_plus, cls: 'bg-red-400' },
                  ].map((row) => {
                    const total = data.credit.aging_0_30 + data.credit.aging_31_60 + data.credit.aging_61_90 + data.credit.aging_90_plus;
                    const pct = total > 0 ? (Number(row.value) / total) * 100 : 0;
                    return (
                      <div key={row.label}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-zinc-600">{row.label}</span>
                          <span className="font-mono font-semibold text-zinc-800">{INR(row.value)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-zinc-100">
                          <div className={`h-full rounded-full ${row.cls}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
