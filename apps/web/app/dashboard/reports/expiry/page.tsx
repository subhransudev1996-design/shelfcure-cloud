import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { reportExpiry, type ExpiryReportRow } from '@shelfcure/api-client';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ExpiryBadge({ days }: { days: number }) {
  if (days < 0) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">EXPIRED</span>;
  if (days <= 30) return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">Critical ({days}d)</span>;
  if (days <= 90) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Warning ({days}d)</span>;
  return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">OK ({days}d)</span>;
}

export default async function ExpiryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const daysAhead = Math.max(0, parseInt(sp.days ?? '90', 10) || 90);

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const rows = await reportExpiry(supabase, storeId, daysAhead).catch(() => [] as ExpiryReportRow[]);

  const expired = rows.filter((r) => r.is_expired);
  const critical = rows.filter((r) => !r.is_expired && r.days_to_expiry <= 30);
  const totalValue = rows.reduce((s, r) => s + Number(r.value_at_mrp), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-yellow-700"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">Expiry Report</h1>
          <p className="text-xs text-zinc-400">Batches nearing or past expiry with value loss</p>
        </div>
        {/* Days filter */}
        <div className="flex gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          {[30, 60, 90, 180].map((d) => (
            <Link key={d} href={`/dashboard/reports/expiry?days=${d}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${d === daysAhead ? 'bg-yellow-50 text-yellow-800' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              {d}d
            </Link>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Total Batches', value: String(rows.length), cls: 'text-zinc-900' },
          { label: 'Expired (in stock)', value: String(expired.length), cls: 'text-red-700' },
          { label: 'Critical (≤30d)', value: String(critical.length), cls: 'text-orange-700' },
          { label: 'Value at Risk', value: INR(totalValue), cls: 'text-amber-700' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
            <p className={`mt-1 text-xl font-black tabular-nums ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center rounded-2xl border-2 border-dashed border-zinc-200">
          <p className="font-semibold text-zinc-700">No batches expiring within {daysAhead} days</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Value @ MRP</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.batch_id} className={`hover:bg-zinc-50/60 ${r.is_expired ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-zinc-900">{r.medicine_name}</div>
                    {r.manufacturer && <div className="text-[10px] text-zinc-400">{r.manufacturer}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-700">{r.batch_number}</td>
                  <td className="px-4 py-3 text-xs text-zinc-600">{r.supplier_name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-600">{fmtDate(r.expiry_date)}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-800">{r.current_quantity}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-700">{INR(Number(r.purchase_rate))}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-zinc-900">{INR(Number(r.value_at_mrp))}</td>
                  <td className="px-4 py-3"><ExpiryBadge days={r.days_to_expiry} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-zinc-50">
              <tr>
                <td colSpan={6} className="px-4 py-3 text-xs font-bold text-zinc-500">{rows.length} batches</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-amber-700">{INR(totalValue)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
