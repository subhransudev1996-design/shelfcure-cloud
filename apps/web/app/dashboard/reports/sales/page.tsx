import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { reportDaily, type DailyReportData } from '@shelfcure/api-client';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function dateRange(preset: string): { from: string; to: string; label: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (preset === 'today') {
    return { from: today, to: today, label: 'Today' };
  }
  if (preset === 'week') {
    const day = now.getDay(); // 0=Sun
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((day + 6) % 7));
    return { from: mon.toISOString().slice(0, 10), to: today, label: 'This Week' };
  }
  if (preset === 'last-week') {
    const day = now.getDay();
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - ((day + 6) % 7));
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setDate(thisMonday.getDate() - 1);
    return { from: lastMonday.toISOString().slice(0, 10), to: lastSunday.toISOString().slice(0, 10), label: 'Last Week' };
  }
  if (preset === 'last-month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const last = new Date(y, m + 1, 0);
    return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: last.toISOString().slice(0, 10), label: 'Last Month' };
  }
  // default: this month
  const y = now.getFullYear(), m = now.getMonth();
  const last = new Date(y, m + 1, 0);
  return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: last.toISOString().slice(0, 10), label: 'This Month' };
}

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const preset = sp.preset ?? 'month';
  const range = sp.from && sp.to
    ? { from: sp.from, to: sp.to, label: `${sp.from} → ${sp.to}` }
    : dateRange(preset);

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const data = await reportDaily(supabase, storeId, range.from, range.to).catch(() => null as DailyReportData | null);

  const presets = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'last-week', label: 'Last Week' },
    { key: 'month', label: 'This Month' },
    { key: 'last-month', label: 'Last Month' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-emerald-600"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">Sales Report</h1>
          <p className="text-xs text-zinc-400">{range.label}</p>
        </div>
        {/* Preset tabs */}
        <div className="flex gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          {presets.map((p) => (
            <Link key={p.key} href={`/dashboard/reports/sales?preset=${p.key}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${preset === p.key ? 'bg-emerald-50 text-emerald-800' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="py-16 text-center text-sm text-zinc-500">Failed to load report data.</div>
      ) : (
        <>
          {/* KPIs row 1 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Gross Sales', value: INR(data.gross_sales), cls: 'text-emerald-700' },
              { label: 'Net Sales', value: INR(data.net_sales), cls: 'text-zinc-900' },
              { label: 'Gross Profit', value: INR(data.gross_profit), cls: 'text-indigo-700' },
              { label: 'Net Profit', value: INR(data.net_profit), cls: data.net_profit >= 0 ? 'text-green-700' : 'text-red-700' },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
                <p className={`mt-1 text-xl font-black tabular-nums ${c.cls}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* KPIs row 2 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Bills', value: String(data.bill_count), cls: 'text-zinc-800' },
              { label: 'Avg Bill Value', value: INR(data.avg_bill_value), cls: 'text-zinc-700' },
              { label: 'Returns', value: `${data.returns_count} — ${INR(data.returns_total)}`, cls: 'text-red-700' },
              { label: 'Total GST', value: INR(data.total_gst), cls: 'text-purple-700' },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
                <p className={`mt-1 text-lg font-black tabular-nums ${c.cls}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Payment method breakdown */}
            {data.payments && data.payments.length > 0 && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-zinc-500">Payment Methods</h3>
                <div className="space-y-3">
                  {data.payments.map((p) => {
                    const pct = data.total_paid > 0 ? (Number(p.amount) / data.total_paid) * 100 : 0;
                    return (
                      <div key={p.method}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-medium capitalize text-zinc-700">{p.method.replace('_', ' ')}</span>
                          <span className="font-mono font-bold text-zinc-900">{INR(Number(p.amount))}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-zinc-100">
                          <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-0.5 text-[10px] text-zinc-400">{p.cnt} transactions · {pct.toFixed(1)}%</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top medicines */}
            {data.top_medicines && data.top_medicines.length > 0 && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-zinc-500">Top Medicines</h3>
                <div className="space-y-2">
                  {data.top_medicines.slice(0, 8).map((m, i) => (
                    <div key={m.medicine_id} className="flex items-center gap-3">
                      <span className="w-5 text-center text-[10px] font-bold text-zinc-400">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-zinc-800">{m.name}</p>
                        <p className="text-[10px] text-zinc-400">{m.qty_sold} units · {m.bills} bills</p>
                      </div>
                      <span className="font-mono text-xs font-bold text-emerald-700">{INR(Number(m.revenue))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Daily breakdown */}
          {data.daily_breakdown && data.daily_breakdown.length > 1 && (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Daily Breakdown</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2 text-right">Bills</th>
                    <th className="px-4 py-2 text-right">Gross Sales</th>
                    <th className="px-4 py-2 text-right">Returns</th>
                    <th className="px-4 py-2 text-right">Net Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.daily_breakdown.map((d) => (
                    <tr key={d.day} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-2 text-xs text-zinc-700">
                        {new Date(d.day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600">{d.bill_count}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-emerald-700">{INR(Number(d.gross_sales))}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-red-700">{INR(Number(d.returns_total))}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-zinc-900">{INR(Number(d.net_sales))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
