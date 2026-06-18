import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { reportStockVelocity, type StockVelocityReport, type StockVelocityRow } from '@shelfcure/api-client';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function stockDisplay(r: StockVelocityRow) {
  if (r.sale_unit_mode === 'both' && r.units_per_pack && r.units_per_pack > 1) {
    return `${r.current_stock} u (${(r.current_stock / r.units_per_pack).toFixed(1)} ${r.pack_unit})`;
  }
  if (r.sale_unit_mode === 'pack_only') {
    return `${r.current_stock} ${r.pack_unit}`;
  }
  return `${r.current_stock} units`;
}

const BADGE: Record<string, string> = {
  fast: 'bg-emerald-100 text-emerald-700',
  steady: 'bg-blue-100 text-blue-700',
  slow: 'bg-amber-100 text-amber-700',
  dead: 'bg-zinc-200 text-zinc-700',
};

const WINDOWS = [7, 14, 30, 60, 90, 180, 365];

export default async function VelocityPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const sp = await searchParams;
  const windowDays = WINDOWS.includes(Number(sp.window)) ? Number(sp.window) : 30;

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const data = await reportStockVelocity(supabase, storeId, windowDays).catch(
    () => null as StockVelocityReport | null,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-rose-600"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">Stock Velocity</h1>
          <p className="text-xs text-zinc-400">Fast / steady / slow / dead stock classification with days-of-cover estimates</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          {WINDOWS.map((w) => (
            <Link key={w} href={`/dashboard/reports/velocity?window=${w}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${windowDays === w ? 'bg-rose-50 text-rose-800' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              {w}d
            </Link>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="py-16 text-center text-sm text-zinc-500">Failed to load velocity data.</div>
      ) : (
        <>
          <p className="text-xs text-zinc-400">Rolling {data.window_days}-day window, ending today</p>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Total SKUs</p>
              <p className="mt-1 text-xl font-black tabular-nums text-zinc-900">{data.summary.total_skus}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Fast</p>
              <p className="mt-1 text-xl font-black tabular-nums text-emerald-700">{data.summary.fast_count}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Steady</p>
              <p className="mt-1 text-xl font-black tabular-nums text-blue-700">{data.summary.steady_count}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Slow</p>
              <p className="mt-1 text-xl font-black tabular-nums text-amber-700">{data.summary.slow_count}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Dead</p>
              <p className="mt-1 text-xl font-black tabular-nums text-zinc-700">{data.summary.dead_count}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Value at Risk (Dead)</p>
              <p className="mt-1 text-xl font-black tabular-nums text-red-700">{INR(data.summary.stock_value_at_risk)}</p>
            </div>
          </div>

          {/* Velocity table */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Velocity Detail</h3>
            </div>
            {data.rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-zinc-400">No in-stock medicines found</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-4 py-2">Medicine</th>
                    <th className="px-4 py-2 text-right">Stock</th>
                    <th className="px-4 py-2 text-right">Sold ({data.window_days}d)</th>
                    <th className="px-4 py-2 text-right">Sold (30d)</th>
                    <th className="px-4 py-2 text-right">Velocity/Day</th>
                    <th className="px-4 py-2 text-right">Days of Cover</th>
                    <th className="px-4 py-2 text-right">Last Sale</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.rows.map((r) => (
                    <tr key={r.medicine_id} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-2">
                        <div className="text-xs font-semibold text-zinc-800">{r.name}</div>
                        {r.manufacturer && <div className="text-[10px] text-zinc-400">{r.manufacturer}</div>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-zinc-700">{stockDisplay(r)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-zinc-700">{r.sold_in_window}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-zinc-500">{r.sold_30d}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600">{r.velocity_per_day.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600">{r.days_of_cover === null ? '—' : r.days_of_cover}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-zinc-500">{r.days_since_last_sale === null ? 'Never' : `${r.days_since_last_sale}d ago`}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${BADGE[r.classification]}`}>{r.classification}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
