import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { reportShortage, type ShortageReportRow } from '@shelfcure/api-client';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function displayQty(r: ShortageReportRow) {
  if (r.sale_unit_mode === 'both') {
    const packs = (r.current_quantity / r.units_per_pack).toFixed(2);
    return `${r.current_quantity} units (${packs} ${r.pack_unit})`;
  }
  return `${r.current_quantity} ${r.sale_unit_mode === 'pack' ? r.pack_unit : 'units'}`;
}

export default async function ShortageReportPage() {
  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const rows = await reportShortage(supabase, storeId).catch(() => [] as ShortageReportRow[]);

  const outOfStock = rows.filter((r) => r.is_out_of_stock);
  const low = rows.filter((r) => !r.is_out_of_stock);
  const totalReorderValue = rows.reduce((s, r) => s + Number(r.estimated_reorder_value), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-red-600"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div>
          <h1 className="text-xl font-black text-zinc-900">Shortage Report</h1>
          <p className="text-xs text-zinc-400">Out-of-stock & low items with reorder estimates</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Total Alerts', value: String(rows.length), cls: 'text-zinc-900' },
          { label: 'Out of Stock', value: String(outOfStock.length), cls: 'text-red-700' },
          { label: 'Low Stock', value: String(low.length), cls: 'text-orange-700' },
          { label: 'Est. Reorder Value', value: INR(totalReorderValue), cls: 'text-indigo-700' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
            <p className={`mt-1 text-xl font-black tabular-nums ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center py-16 rounded-2xl border-2 border-dashed border-zinc-200">
          <p className="font-semibold text-zinc-700">All stock levels are healthy — no shortages detected</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Current Stock</th>
                <th className="px-4 py-3 text-right">Min Level</th>
                <th className="px-4 py-3 text-right">Shortage</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Last Purchase</th>
                <th className="px-4 py-3 text-right">Est. Reorder</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.medicine_id} className={`hover:bg-zinc-50/60 ${r.is_out_of_stock ? 'bg-red-50/30' : 'bg-orange-50/20'}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-zinc-900">{r.medicine_name}</div>
                    {r.manufacturer && <div className="text-[10px] text-zinc-400">{r.manufacturer}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-700">{displayQty(r)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-zinc-600">{r.min_stock_level}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-bold text-red-700">{r.shortage_qty}</td>
                  <td className="px-4 py-3 text-xs text-zinc-600">{r.primary_supplier_name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {r.last_purchase_date
                      ? new Date(r.last_purchase_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-indigo-700">{INR(Number(r.estimated_reorder_value))}</td>
                  <td className="px-4 py-3">
                    {r.is_out_of_stock
                      ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">OUT</span>
                      : <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">LOW</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-zinc-50">
              <tr>
                <td colSpan={6} className="px-4 py-3 text-xs font-bold text-zinc-500">{rows.length} medicines affected</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700">{INR(totalReorderValue)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
