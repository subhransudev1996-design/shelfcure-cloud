import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { listReturns, type SaleReturnListRow } from '@shelfcure/api-client';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function monthRange(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, d.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${last}` };
}

export default async function SalesReturnsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const range = sp.from && sp.to ? { from: sp.from, to: sp.to } : monthRange(0);

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const returns = await listReturns(supabase, { storeId, from: range.from, to: range.to }).catch(
    () => [] as SaleReturnListRow[],
  );

  const totalRefunded = returns.reduce((s, r) => s + Number(r.total_amount), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-cyan-700"><path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">Sales Returns</h1>
          <p className="text-xs text-zinc-400">{range.from} → {range.to}</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          <Link href={`/dashboard/reports/returns?from=${monthRange(0).from}&to=${monthRange(0).to}`}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">This Month</Link>
          <Link href={`/dashboard/reports/returns?from=${monthRange(-1).from}&to=${monthRange(-1).to}`}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Last Month</Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[
          { label: 'Total Returns', value: String(returns.length), cls: 'text-zinc-900' },
          { label: 'Total Refunded', value: INR(totalRefunded), cls: 'text-red-700' },
          { label: 'Avg Refund', value: returns.length > 0 ? INR(totalRefunded / returns.length) : '₹0.00', cls: 'text-zinc-700' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
            <p className={`mt-1 text-xl font-black tabular-nums ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {returns.length === 0 ? (
        <div className="flex flex-col items-center py-16 rounded-2xl border-2 border-dashed border-zinc-200">
          <p className="font-semibold text-zinc-700">No returns in this period</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              <tr>
                <th className="px-4 py-3">Return #</th>
                <th className="px-4 py-3">Original Bill</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Refund</th>
                <th className="px-4 py-3">Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {returns.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50/60">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-zinc-700">{r.return_number}</td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/sales/${r.sale_id}`} className="font-mono text-xs text-indigo-600 hover:underline">
                      {r.bill_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-700">{r.customer_name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {new Date(r.return_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-zinc-600">{r.item_count}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-red-700">{INR(Number(r.total_amount))}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium capitalize text-zinc-600">
                      {r.refund_method ?? 'cash'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-zinc-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-xs font-bold text-zinc-500">{returns.length} returns</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-red-700">{INR(totalRefunded)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
