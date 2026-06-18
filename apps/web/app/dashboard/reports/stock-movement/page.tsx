import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { reportStockMovement, type StockMovementReport, type StockMovementRow } from '@shelfcure/api-client';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function stockDisplay(r: StockMovementRow) {
  if (r.sale_unit_mode === 'both' && r.units_per_pack > 1) {
    return `${r.current_stock} u (${(r.current_stock / r.units_per_pack).toFixed(1)} ${r.pack_unit})`;
  }
  return `${r.current_stock} ${r.sale_unit_mode === 'pack' ? r.pack_unit : 'units'}`;
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
  if (preset === '7d') {
    const d = new Date(now);
    d.setDate(now.getDate() - 6);
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  if (preset === '30d') {
    const d = new Date(now);
    d.setDate(now.getDate() - 29);
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  // default: this month
  const y = now.getFullYear(), m = now.getMonth();
  return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: today };
}

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: '7d', label: 'Last 7 Days' },
  { key: 'month', label: 'This Month' },
  { key: '30d', label: 'Last 30 Days' },
];

export default async function StockMovementPage({
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

  const data = await reportStockMovement(supabase, storeId, range.from, range.to).catch(
    () => null as StockMovementReport | null,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-orange-600"><path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">Stock Movement</h1>
          <p className="text-xs text-zinc-400">Inflow from purchases, outflow from sales, and net stock change per medicine</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          {PRESETS.map((p) => (
            <Link key={p.key} href={`/dashboard/reports/stock-movement?preset=${p.key}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${preset === p.key && !sp.from ? 'bg-orange-50 text-orange-800' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="py-16 text-center text-sm text-zinc-500">Failed to load stock movement data.</div>
      ) : (
        <>
          <p className="text-xs text-zinc-400">
            {fmtDate(data.period.from)} → {fmtDate(data.period.to)}
          </p>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Qty In</p>
              <p className="mt-1 text-xl font-black tabular-nums text-emerald-700">+{data.summary.qty_in}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Qty Out</p>
              <p className="mt-1 text-xl font-black tabular-nums text-red-700">-{data.summary.qty_out}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Net Change</p>
              <p className={`mt-1 text-xl font-black tabular-nums ${data.summary.net_change >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {data.summary.net_change >= 0 ? '+' : ''}{data.summary.net_change}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">SKUs Moved</p>
              <p className="mt-1 text-xl font-black tabular-nums text-zinc-900">{data.summary.skus_moved}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Dormant (in stock)</p>
              <p className="mt-1 text-xl font-black tabular-nums text-amber-700">{data.summary.dormant_in_stock}</p>
            </div>
          </div>

          {/* Movement table */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Movement Ledger</h3>
            </div>
            {data.rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-zinc-400">No stock or movement in this period</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-4 py-2">Medicine</th>
                    <th className="px-4 py-2 text-right">Current Stock</th>
                    <th className="px-4 py-2 text-right">Purchased In</th>
                    <th className="px-4 py-2 text-right">Returned In</th>
                    <th className="px-4 py-2 text-right">Sold Out</th>
                    <th className="px-4 py-2 text-right">Returned Out</th>
                    <th className="px-4 py-2 text-right">Net Change</th>
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
                      <td className="px-4 py-2 text-right font-mono text-xs text-emerald-700">
                        {r.purchased_in > 0 ? `+${r.purchased_in}` : '0'}
                        {r.purchased_value > 0 && <span className="ml-1 text-zinc-400">({INR(r.purchased_value)})</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-emerald-700">{r.sale_returned_in > 0 ? `+${r.sale_returned_in}` : '0'}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-red-700">
                        {r.sold_out > 0 ? `-${r.sold_out}` : '0'}
                        {r.sold_value > 0 && <span className="ml-1 text-zinc-400">({INR(r.sold_value)})</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-red-700">{r.purchase_returned_out > 0 ? `-${r.purchase_returned_out}` : '0'}</td>
                      <td className={`px-4 py-2 text-right font-mono font-semibold ${r.net_change >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {r.net_change >= 0 ? '+' : ''}{r.net_change}
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
