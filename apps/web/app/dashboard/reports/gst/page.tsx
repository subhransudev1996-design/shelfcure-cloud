import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { reportGstMonthly, type GstMonthlyReport } from '@shelfcure/api-client';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function GstSlab({ label, slabs }: {
  label: string;
  slabs: GstMonthlyReport['output']['slabs'];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">{label}</h3>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          <tr>
            <th className="px-4 py-2">GST Rate</th>
            <th className="px-4 py-2 text-right">Transactions</th>
            <th className="px-4 py-2 text-right">Taxable</th>
            <th className="px-4 py-2 text-right">CGST</th>
            <th className="px-4 py-2 text-right">SGST</th>
            <th className="px-4 py-2 text-right">IGST</th>
            <th className="px-4 py-2 text-right">Total GST</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {slabs.map((s) => (
            <tr key={s.gst_rate} className="hover:bg-zinc-50/60">
              <td className="px-4 py-2 font-semibold text-zinc-900">{s.gst_rate}%</td>
              <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600">{s.transactions}</td>
              <td className="px-4 py-2 text-right font-mono text-xs text-zinc-700">{INR(Number(s.taxable_amount))}</td>
              <td className="px-4 py-2 text-right font-mono text-xs text-zinc-700">{INR(Number(s.cgst))}</td>
              <td className="px-4 py-2 text-right font-mono text-xs text-zinc-700">{INR(Number(s.sgst))}</td>
              <td className="px-4 py-2 text-right font-mono text-xs text-zinc-700">{INR(Number(s.igst))}</td>
              <td className="px-4 py-2 text-right font-mono font-semibold text-zinc-900">{INR(Number(s.total_gst))}</td>
            </tr>
          ))}
          {slabs.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-4 text-center text-xs text-zinc-400">No transactions</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function GstReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const month = parseInt(sp.month ?? String(now.getMonth() + 1), 10);
  const year = parseInt(sp.year ?? String(now.getFullYear()), 10);

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const data = await reportGstMonthly(supabase, storeId, month, year).catch(() => null as GstMonthlyReport | null);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-purple-700"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">GST Summary</h1>
          <p className="text-xs text-zinc-400">{MONTHS[month - 1]} {year} — Input/Output tax breakdown</p>
        </div>
        {/* Month navigation */}
        <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          <Link href={`/dashboard/reports/gst?month=${prevMonth}&year=${prevYear}`}
            className="rounded-lg p-1.5 hover:bg-zinc-50">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-600"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
          <span className="px-3 text-xs font-bold text-zinc-700">{(MONTHS[month - 1] ?? '').slice(0, 3)} {year}</span>
          <Link href={`/dashboard/reports/gst?month=${nextMonth}&year=${nextYear}`}
            className="rounded-lg p-1.5 hover:bg-zinc-50">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-600"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>
      </div>

      {!data ? (
        <div className="py-16 text-center text-sm text-zinc-500">Failed to load GST data.</div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Output GST', value: INR(data.output.total_gst), cls: 'text-zinc-900' },
              { label: 'Input Tax Credit', value: INR(data.input.total_gst + data.pr_gst), cls: 'text-emerald-700' },
              { label: 'Net Output', value: INR(data.net_output_gst), cls: 'text-indigo-700' },
              { label: 'Net Payable', value: INR(data.net_payable), cls: data.net_payable > 0 ? 'text-red-700' : 'text-emerald-700' },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
                <p className={`mt-1 text-xl font-black tabular-nums ${c.cls}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Net payable reconciliation */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-zinc-500">Reconciliation</h3>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Output GST (sales)', value: data.output.total_gst, sign: '+' },
                { label: 'Sales Return GST adjustment', value: -data.sr_gst, sign: '−', cls: 'text-red-700' },
                { label: 'Net Output GST', value: data.net_output_gst, bold: true },
                null,
                { label: 'Input Tax Credit (purchases)', value: data.input.total_gst, sign: '−', cls: 'text-emerald-700' },
                { label: 'Purchase Return ITC reversal', value: data.pr_gst, sign: '+', cls: 'text-orange-700' },
                { label: 'Net ITC', value: data.net_itc, bold: true },
                null,
                { label: 'Net GST Payable', value: data.net_payable, bold: true, cls: data.net_payable > 0 ? 'text-red-700' : 'text-emerald-700' },
              ].map((row, i) =>
                row === null ? (
                  <div key={i} className="border-t border-zinc-100 pt-2" />
                ) : (
                  <div key={row.label} className={`flex justify-between ${row.bold ? 'font-bold' : ''} ${row.cls ?? 'text-zinc-700'}`}>
                    <span>{row.label}</span>
                    <span className="font-mono">{INR(Number(row.value))}</span>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Slabs */}
          <GstSlab label="Output (Sales)" slabs={data.output.slabs} />
          <GstSlab label="Input (Purchases — ITC)" slabs={data.input.slabs} />
        </>
      )}

      {/* Annual GST link */}
      <div className="flex justify-end">
        <Link href="/dashboard/reports/gst/annual"
          className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100">
          View Annual GSTR-9 →
        </Link>
      </div>
    </div>
  );
}
