import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { reportStockSummary, type StockSummaryRow } from '@shelfcure/api-client';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function stockDisplay(r: StockSummaryRow) {
  if (r.sale_unit_mode === 'both') {
    return `${r.total_quantity} u (${(r.total_quantity / r.units_per_pack).toFixed(1)} ${r.pack_unit})`;
  }
  return `${r.total_quantity} ${r.sale_unit_mode === 'pack' ? r.pack_unit : 'units'}`;
}

export default async function StockReportPage() {
  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const rows = await reportStockSummary(supabase, storeId).catch(() => [] as StockSummaryRow[]);

  const totalValue = rows.reduce((s, r) => s + Number(r.stock_value), 0);
  const lowStockCount = rows.filter((r) => r.is_low_stock).length;
  const totalBatches = rows.reduce((s, r) => s + r.active_batches, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-amber-700"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div>
          <h1 className="text-xl font-black text-zinc-900">Stock Summary</h1>
          <p className="text-xs text-zinc-400">Inventory valuation, batch count & expiry snapshot</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Medicines', value: String(rows.length), cls: 'text-zinc-900' },
          { label: 'Active Batches', value: String(totalBatches), cls: 'text-zinc-700' },
          { label: 'Low Stock Alerts', value: String(lowStockCount), cls: 'text-orange-700' },
          { label: 'Total Stock Value', value: INR(totalValue), cls: 'text-emerald-700' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
            <p className={`mt-1 text-xl font-black tabular-nums ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center py-16 rounded-2xl border-2 border-dashed border-zinc-200">
          <p className="font-semibold text-zinc-700">No stock data available</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Batches</th>
                <th className="px-4 py-3 text-right">Min Level</th>
                <th className="px-4 py-3">Nearest Expiry</th>
                <th className="px-4 py-3 text-right">Stock Value</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.medicine_id} className={`hover:bg-zinc-50/60 ${r.is_low_stock ? 'bg-orange-50/20' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-zinc-900">{r.medicine_name}</div>
                    {r.manufacturer && <div className="text-[10px] text-zinc-400">{r.manufacturer}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-zinc-800">{stockDisplay(r)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-zinc-600">{r.active_batches}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-zinc-500">{r.min_stock_level}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{fmtDate(r.nearest_expiry)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-zinc-900">{INR(Number(r.stock_value))}</td>
                  <td className="px-4 py-3">
                    {r.is_low_stock
                      ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">LOW</span>
                      : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-zinc-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-xs font-bold text-zinc-500">{rows.length} medicines · {totalBatches} batches</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{INR(totalValue)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
