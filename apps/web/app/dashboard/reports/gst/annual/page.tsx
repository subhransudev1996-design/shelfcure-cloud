import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../../lib/active-store';
import { reportGstAnnual, type GstAnnualReport } from '@shelfcure/api-client';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function currentFinYearStart(): number {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

function finYearLabel(startYear: number): string {
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function buildFinYearOptions(): number[] {
  const current = currentFinYearStart();
  return Array.from({ length: 6 }, (_, i) => current - i);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function GstAnnualPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const sp = await searchParams;
  const options = buildFinYearOptions();
  const finYear = options.includes(Number(sp.fy)) ? Number(sp.fy) : currentFinYearStart();

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const data = await reportGstAnnual(supabase, storeId, finYear).catch(() => null as GstAnnualReport | null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports/gst" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-fuchsia-700"><path d="M9 12l2 2 4-4M7 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-6-6ZM7 2v6h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">Annual GST (GSTR-9)</h1>
          <p className="text-xs text-zinc-400">FY {finYearLabel(finYear)} — full-year GST summary</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          {options.map((y) => (
            <Link key={y} href={`/dashboard/reports/gst/annual?fy=${y}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${finYear === y ? 'bg-fuchsia-50 text-fuchsia-800' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              {finYearLabel(y)}
            </Link>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="py-16 text-center text-sm text-zinc-500">Failed to load annual GST data.</div>
      ) : (
        <>
          <p className="text-xs text-zinc-400">{fmtDate(data.period.from)} → {fmtDate(data.period.to)}</p>

          {/* Summary chips */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Output GST (Sales)</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-zinc-900">{INR(data.out_total_gst)}</p>
              <p className="mt-1 text-[10px] text-zinc-400">B2B {INR(data.out_b2b_taxable)} · B2C {INR(data.out_b2c_taxable)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Input Tax Credit</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-emerald-700">{INR(data.in_total_gst)}</p>
              <p className="mt-1 text-[10px] text-zinc-400">Net ITC {INR(data.net_itc)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Net GST Payable</p>
              <p className={`mt-1 text-2xl font-black tabular-nums ${data.net_payable > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{INR(data.net_payable)}</p>
              <p className="mt-1 text-[10px] text-zinc-400">Net Output {INR(data.net_output_gst)}</p>
            </div>
          </div>

          {/* Annual totals breakdown */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Output (Sales)</h3>
              </div>
              <div className="space-y-2 p-4 text-sm">
                {[
                  ['Taxable Amount', data.out_taxable],
                  ['CGST', data.out_cgst],
                  ['SGST', data.out_sgst],
                  ['IGST', data.out_igst],
                  ['Sales Return GST', -data.sr_gst],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between text-zinc-700">
                    <span>{label}</span>
                    <span className="font-mono">{INR(value as number)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Input (Purchases — ITC)</h3>
              </div>
              <div className="space-y-2 p-4 text-sm">
                {[
                  ['Taxable Amount', data.in_taxable],
                  ['CGST', data.in_cgst],
                  ['SGST', data.in_sgst],
                  ['IGST', data.in_igst],
                  ['Purchase Return ITC Reversal', -data.pr_gst],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between text-zinc-700">
                    <span>{label}</span>
                    <span className="font-mono">{INR(value as number)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Monthly breakdown */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Month-by-Month (Filing Cross-Check)</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                <tr>
                  <th className="px-4 py-2">Month</th>
                  <th className="px-4 py-2 text-right">Output GST</th>
                  <th className="px-4 py-2 text-right">Input ITC</th>
                  <th className="px-4 py-2 text-right">Net Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.monthly_rows.map((row) => (
                  <tr key={row.month} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-2 text-xs font-semibold text-zinc-800">{row.month}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-zinc-700">{INR(row.out_total_gst)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-emerald-700">{INR(row.in_total_gst)}</td>
                    <td className={`px-4 py-2 text-right font-mono font-semibold ${row.net_payable > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{INR(row.net_payable)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-zinc-200 bg-zinc-50/60">
                <tr>
                  <td className="px-4 py-2 text-xs font-bold text-zinc-700">Total</td>
                  <td className="px-4 py-2 text-right font-mono text-xs font-bold text-zinc-900">{INR(data.out_total_gst)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs font-bold text-emerald-700">{INR(data.in_total_gst)}</td>
                  <td className={`px-4 py-2 text-right font-mono text-xs font-bold ${data.net_payable > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{INR(data.net_payable)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
