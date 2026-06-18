import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import {
  reportGrowthTrend,
  type GrowthTrendReport,
  type PerfPeriodType,
} from '@shelfcure/api-client';
import { KpiCard } from '../kpi-delta';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export default async function GrowthTrendPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const periodType = (PERIODS.some((p) => p.value === sp.period) ? sp.period : 'month') as PerfPeriodType;

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const data = await reportGrowthTrend(supabase, storeId, periodType).catch(
    () => null as GrowthTrendReport | null,
  );

  const suppress = periodType === 'all';
  const maxTrendRevenue = data ? Math.max(...data.trend.map((t) => t.revenue), 1) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-teal-600"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">Growth Trend</h1>
          <p className="text-xs text-zinc-400">Period-over-period growth, 12-month trajectory, and medicine-level movers</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={`/dashboard/reports/growth?period=${p.value}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                periodType === p.value ? 'bg-teal-50 text-teal-800' : 'text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="py-16 text-center text-sm text-zinc-500">Failed to load growth data.</div>
      ) : (
        <>
          <p className="text-xs text-zinc-400">
            {fmtDate(data.period.current_from)} → {fmtDate(data.period.current_to)}
            {!suppress && data.period.previous_from && (
              <> · compared to {fmtDate(data.period.previous_from)} → {fmtDate(data.period.previous_to!)}</>
            )}
          </p>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Revenue" kpi={data.kpis.revenue} format={INR} suppress={suppress} tone="text-emerald-700" />
            <KpiCard label="Bills" kpi={data.kpis.bills} format={(n) => String(n)} suppress={suppress} />
            <KpiCard label="Avg Bill Value" kpi={data.kpis.avg_bill_value} format={INR} suppress={suppress} />
            <KpiCard label="Items Sold" kpi={data.kpis.items_sold} format={(n) => String(n)} suppress={suppress} />
            <KpiCard label="Gross Profit" kpi={data.kpis.gross_profit} format={INR} suppress={suppress} tone="text-indigo-700" />
            <KpiCard label="Active Customers" kpi={data.kpis.active_customers} format={(n) => String(n)} suppress={suppress} />
            <KpiCard label="New Customers" kpi={data.kpis.new_customers} format={(n) => String(n)} suppress={suppress} tone="text-blue-700" />
          </div>

          {/* 12-month trajectory */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">12-Month Sales Trajectory</h3>
            </div>
            <div className="flex items-end gap-2 overflow-x-auto px-4 py-4" style={{ minHeight: 140 }}>
              {data.trend.map((t) => {
                const heightPct = Math.max(2, (t.revenue / maxTrendRevenue) * 100);
                return (
                  <div key={t.period_start} className="flex flex-col items-center gap-1" style={{ minWidth: 44 }}>
                    <div className="flex h-24 w-full items-end justify-center">
                      <div
                        className="w-6 rounded-t bg-teal-400"
                        style={{ height: `${heightPct}%` }}
                        title={`${t.label}: ${INR(t.revenue)} · ${t.bills} bill${t.bills === 1 ? '' : 's'}`}
                      />
                    </div>
                    <span className="text-[9px] text-zinc-400">{t.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Growers / Decliners */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-emerald-50/40 px-4 py-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-emerald-700">Top Growers</h3>
              </div>
              {data.growers.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-zinc-400">No growing medicines this period</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    <tr>
                      <th className="px-4 py-2">Medicine</th>
                      <th className="px-4 py-2 text-right">Current</th>
                      <th className="px-4 py-2 text-right">Previous</th>
                      <th className="px-4 py-2 text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {data.growers.map((row) => (
                      <tr key={row.medicine_id} className="hover:bg-zinc-50/60">
                        <td className="px-4 py-2 text-xs font-semibold text-zinc-800">
                          {row.name}
                          {row.manufacturer && <span className="ml-1 text-zinc-400">· {row.manufacturer}</span>}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-zinc-700">{INR(row.cur_rev)}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-zinc-500">{INR(row.prev_rev)}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-emerald-700">+{INR(row.rev_delta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-red-50/40 px-4 py-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-red-700">Top Decliners</h3>
              </div>
              {data.decliners.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-zinc-400">No declining medicines this period — good news!</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    <tr>
                      <th className="px-4 py-2">Medicine</th>
                      <th className="px-4 py-2 text-right">Current</th>
                      <th className="px-4 py-2 text-right">Previous</th>
                      <th className="px-4 py-2 text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {data.decliners.map((row) => (
                      <tr key={row.medicine_id} className="hover:bg-zinc-50/60">
                        <td className="px-4 py-2 text-xs font-semibold text-zinc-800">
                          {row.name}
                          {row.manufacturer && <span className="ml-1 text-zinc-400">· {row.manufacturer}</span>}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-zinc-700">{INR(row.cur_rev)}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-zinc-500">{INR(row.prev_rev)}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-red-700">{INR(row.rev_delta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
