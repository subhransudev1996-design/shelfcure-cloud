import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { reportDoctors, type DoctorReportData } from '@shelfcure/api-client';

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

export default async function DoctorsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const range = sp.from && sp.to ? { from: sp.from, to: sp.to } : monthRange(0);

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const data = await reportDoctors(supabase, storeId, range.from, range.to).catch(
    () => null as DoctorReportData | null,
  );

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
          <h1 className="text-xl font-black text-zinc-900">Doctor Prescriptions</h1>
        </div>
        <div className="py-16 text-center text-sm text-zinc-500">Failed to load data. Please try again.</div>
      </div>
    );
  }

  const doctors = data.doctors ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-pink-600"><path d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1M17 8l1.5 1.5M17 8l-1.5 1.5M17 8v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">Doctor Prescriptions</h1>
          <p className="text-xs text-zinc-400">
            {range.from} → {range.to}
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          <Link href={`/dashboard/reports/doctors?from=${monthRange(0).from}&to=${monthRange(0).to}`}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">This Month</Link>
          <Link href={`/dashboard/reports/doctors?from=${monthRange(-1).from}&to=${monthRange(-1).to}`}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Last Month</Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Prescription Bills', value: String(data.prescription_count), cls: 'text-zinc-900' },
          { label: 'Prescription Revenue', value: INR(data.prescription_revenue), cls: 'text-emerald-700' },
          { label: 'Rx Share of Sales', value: `${Number(data.prescription_share).toFixed(1)}%`, cls: 'text-indigo-700' },
          { label: 'Commission Paid', value: INR(data.total_commission_earned), cls: 'text-orange-700' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
            <p className={`mt-1 text-xl font-black tabular-nums ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Doctor breakdown */}
      {doctors.length === 0 ? (
        <div className="flex flex-col items-center py-16 rounded-2xl border-2 border-dashed border-zinc-200">
          <p className="font-semibold text-zinc-700">No prescription sales recorded in this period</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              <tr>
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3 text-right">Bills</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">Gross Profit</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3 text-right">Commission Paid</th>
                <th className="px-4 py-3 text-right">Net Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {doctors.map((d) => (
                <tr key={d.doctor_id} className="hover:bg-zinc-50/60">
                  <td className="px-4 py-3 font-semibold text-zinc-900">{d.doctor_name}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-zinc-700">{d.sale_count}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-700">{INR(Number(d.revenue))}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-700">{INR(Number(d.gross_profit))}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
                      {d.commission_type === 'percentage' ? `${d.commission_rate}%` : `₹${d.commission_rate}/bill`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-orange-700">{INR(Number(d.commission_earned))}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-zinc-900">{INR(Number(d.net_profit))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-zinc-50">
              <tr>
                <td className="px-4 py-3 text-xs font-bold text-zinc-500">{doctors.length} doctors</td>
                <td />
                <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{INR(data.prescription_revenue)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-zinc-700">{INR(data.total_gross_profit)}</td>
                <td />
                <td className="px-4 py-3 text-right font-mono font-bold text-orange-700">{INR(data.total_commission_earned)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-zinc-900">{INR(data.total_net_profit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
