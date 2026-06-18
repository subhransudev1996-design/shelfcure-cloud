import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { reportProfitTracking, type ProfitTrackingReport } from '@shelfcure/api-client';
import { KpiCard } from '../kpi-delta';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function presetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (preset === 'today') return { from: today, to: today };
  if (preset === 'week') {
    const day = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((day + 6) % 7));
    return { from: mon.toISOString().slice(0, 10), to: today };
  }
  if (preset === 'last-month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const last = new Date(y, m + 1, 0);
    return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: last.toISOString().slice(0, 10) };
  }
  if (preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const y = now.getFullYear();
    const startMonth = q * 3;
    return { from: `${y}-${String(startMonth + 1).padStart(2, '0')}-01`, to: today };
  }
  // default: this month
  const y = now.getFullYear(), m = now.getMonth();
  return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: today };
}

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'last-month', label: 'Last Month' },
  { key: 'quarter', label: 'This Quarter' },
];

export default async function ProfitTrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const preset = sp.preset ?? 'month';
  const range = sp.from && sp.to ? { from: sp.from, to: sp.to } : presetRange(preset);

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const data = await reportProfitTracking(supabase, storeId, range.from, range.to).catch(
    () => null as ProfitTrackingReport | null,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-green-700"><path d="M3 17l4-8 4 4 4-6 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">Profit Tracking</h1>
          <p className="text-xs text-zinc-400">Accounting-grade P&amp;L, daily trend, and manufacturer profitability</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          {PRESETS.map((p) => (
            <Link key={p.key} href={`/dashboard/reports/profit?preset=${p.key}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${preset === p.key && !sp.from ? 'bg-green-50 text-green-800' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="py-16 text-center text-sm text-zinc-500">Failed to load profit data.</div>
      ) : (
        <>
          <p className="text-xs text-zinc-400">
            {fmtDate(data.period.from)} → {fmtDate(data.period.to)} ({data.period.days} day{data.period.days === 1 ? '' : 's'})
            {' · '}compared to {fmtDate(data.period.previous_from)} → {fmtDate(data.period.previous_to)}
          </p>

          {/* P&L KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Net Sales" kpi={data.kpis.net_sales} format={INR} suppress={false} tone="text-zinc-900" />
            <KpiCard label="Bills" kpi={data.kpis.bills} format={(n) => String(n)} suppress={false} />
            <KpiCard label="Gross Profit" kpi={data.kpis.gross_profit} format={INR} suppress={false} tone="text-indigo-700" />
            <KpiCard label="Net Profit" kpi={data.kpis.net_profit} format={INR} suppress={false} tone={Number(data.kpis.net_profit.current) >= 0 ? 'text-green-700' : 'text-red-700'} />
            <KpiCard label="Gross Margin" kpi={data.kpis.gross_margin_pct} format={(n) => `${n.toFixed(1)}%`} suppress={false} />
            <KpiCard label="Net Margin" kpi={data.kpis.net_margin_pct} format={(n) => `${n.toFixed(1)}%`} suppress={false} />
          </div>

          {/* Secondary stats */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: 'Gross Sales', value: INR(data.gross_sales), cls: 'text-zinc-800' },
              { label: 'Returns', value: INR(data.returns_total), cls: 'text-red-700' },
              { label: 'Bill Discounts', value: INR(data.bill_discounts), cls: 'text-amber-700' },
              { label: 'Expenses', value: INR(data.expenses_total), cls: 'text-orange-700' },
              { label: 'Avg Profit / Day', value: INR(data.avg_profit_per_day), cls: 'text-emerald-700' },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
                <p className={`mt-1 text-base font-black tabular-nums ${c.cls}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Daily profit trend */}
          {data.daily.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Daily Profit Trend</h3>
              </div>
              {/* Simple bar visualization */}
              <div className="flex items-end gap-1 overflow-x-auto px-4 py-4" style={{ minHeight: 120 }}>
                {(() => {
                  const maxProfit = Math.max(...data.daily.map((d) => Math.abs(Number(d.gross_profit))), 1);
                  return data.daily.map((d) => {
                    const profit = Number(d.gross_profit);
                    const heightPct = Math.max(4, (Math.abs(profit) / maxProfit) * 100);
                    return (
                      <div key={d.day} className="flex flex-col items-center gap-1" style={{ minWidth: 28 }}>
                        <div className="flex h-20 w-full items-end justify-center">
                          <div
                            className={`w-4 rounded-t ${profit >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                            style={{ height: `${heightPct}%` }}
                            title={`${fmtDateShort(d.day)}: ${INR(profit)}`}
                          />
                        </div>
                        <span className="text-[9px] text-zinc-400">{fmtDateShort(d.day)}</span>
                      </div>
                    );
                  });
                })()}
              </div>
              <table className="w-full text-sm">
                <thead className="border-t border-zinc-100 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2 text-right">Bills</th>
                    <th className="px-4 py-2 text-right">Revenue</th>
                    <th className="px-4 py-2 text-right">COGS</th>
                    <th className="px-4 py-2 text-right">Gross Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.daily.map((d) => (
                    <tr key={d.day} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-2 text-xs text-zinc-700">{fmtDate(d.day)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600">{d.bills}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-zinc-700">{INR(d.revenue)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600">{INR(d.cogs)}</td>
                      <td className={`px-4 py-2 text-right font-mono font-semibold ${Number(d.gross_profit) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{INR(d.gross_profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Top Earners / Loss Makers */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-emerald-50/40 px-4 py-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-emerald-700">Top Earning Manufacturers</h3>
              </div>
              {data.top_earners.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-zinc-400">No data for this period</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    <tr>
                      <th className="px-4 py-2">Manufacturer</th>
                      <th className="px-4 py-2 text-right">SKUs</th>
                      <th className="px-4 py-2 text-right">Profit</th>
                      <th className="px-4 py-2 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {data.top_earners.map((row) => (
                      <tr key={row.manufacturer} className="hover:bg-zinc-50/60">
                        <td className="px-4 py-2 text-xs font-semibold text-zinc-800">{row.manufacturer}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600">{row.skus}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-emerald-700">{INR(row.profit)}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600">{row.margin_pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-red-50/40 px-4 py-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-red-700">Loss-Making Manufacturers</h3>
              </div>
              {data.loss_makers.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-zinc-400">No loss-making manufacturers — good news!</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    <tr>
                      <th className="px-4 py-2">Manufacturer</th>
                      <th className="px-4 py-2 text-right">SKUs</th>
                      <th className="px-4 py-2 text-right">Loss</th>
                      <th className="px-4 py-2 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {data.loss_makers.map((row) => (
                      <tr key={row.manufacturer} className="hover:bg-zinc-50/60">
                        <td className="px-4 py-2 text-xs font-semibold text-zinc-800">{row.manufacturer}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600">{row.skus}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-red-700">{INR(row.profit)}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600">{row.margin_pct.toFixed(1)}%</td>
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
