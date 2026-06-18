import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { reportDailyCollection, type DailyCollectionReport } from '@shelfcure/api-client';

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

export default async function DailyCollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const preset = sp.preset ?? 'week';
  const range = sp.from && sp.to ? { from: sp.from, to: sp.to } : presetRange(preset);

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const data = await reportDailyCollection(supabase, storeId, range.from, range.to).catch(
    () => null as DailyCollectionReport | null,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-indigo-600"><path d="M12 3v1m0 16v1M4.22 4.22l.7.7m12.02 12.02.7.7M1 12h1m18 0h1M4.22 19.78l.7-.7M18.36 5.64l-.7.7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">Daily Collection</h1>
          <p className="text-xs text-zinc-400">Per-day Cash / UPI / Card / Other tally for end-of-day reconciliation</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          {PRESETS.map((p) => (
            <Link key={p.key} href={`/dashboard/reports/daily-collection?preset=${p.key}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${preset === p.key && !sp.from ? 'bg-indigo-50 text-indigo-800' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="py-16 text-center text-sm text-zinc-500">Failed to load collection data.</div>
      ) : (
        <>
          <p className="text-xs text-zinc-400">
            {fmtDate(data.period.from)} → {fmtDate(data.period.to)}
          </p>

          {/* Period totals */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Cash</p>
              <p className="mt-1 text-lg font-black tabular-nums text-emerald-700">{INR(data.totals.total_cash)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">UPI</p>
              <p className="mt-1 text-lg font-black tabular-nums text-blue-700">{INR(data.totals.total_upi)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Card</p>
              <p className="mt-1 text-lg font-black tabular-nums text-violet-700">{INR(data.totals.total_card)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Other</p>
              <p className="mt-1 text-lg font-black tabular-nums text-zinc-600">{INR(data.totals.total_other)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Total Collected</p>
              <p className="mt-1 text-lg font-black tabular-nums text-zinc-900">{INR(data.totals.total_collected)}</p>
              <p className="mt-0.5 text-[10px] text-zinc-400">{data.totals.total_bills} bill{data.totals.total_bills === 1 ? '' : 's'}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Credit Pending</p>
              <p className="mt-1 text-lg font-black tabular-nums text-red-700">{INR(data.totals.total_credit_pending)}</p>
            </div>
          </div>

          {/* Daily reconciliation table */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Daily Reconciliation</h3>
            </div>
            {data.rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-zinc-400">No collections in this period</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2 text-right">Bills</th>
                    <th className="px-4 py-2 text-right">Cash</th>
                    <th className="px-4 py-2 text-right">UPI</th>
                    <th className="px-4 py-2 text-right">Card</th>
                    <th className="px-4 py-2 text-right">Other</th>
                    <th className="px-4 py-2 text-right">Total Collected</th>
                    <th className="px-4 py-2 text-right">Credit Pending</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.rows.map((row) => (
                    <tr key={row.date} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-2 text-xs text-zinc-700">{fmtDateShort(row.date)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600">{row.bill_count}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-emerald-700">{INR(row.cash)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-blue-700">{INR(row.upi)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-violet-700">{INR(row.card)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600">{INR(row.other)}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-zinc-900">{INR(row.total_collected)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-red-700">{INR(row.credit_pending)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-zinc-200 bg-zinc-50/60">
                  <tr>
                    <td className="px-4 py-2 text-xs font-bold text-zinc-700">Total</td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-bold text-zinc-700">{data.totals.total_bills}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-bold text-emerald-700">{INR(data.totals.total_cash)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-bold text-blue-700">{INR(data.totals.total_upi)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-bold text-violet-700">{INR(data.totals.total_card)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-bold text-zinc-700">{INR(data.totals.total_other)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-bold text-zinc-900">{INR(data.totals.total_collected)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-bold text-red-700">{INR(data.totals.total_credit_pending)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
