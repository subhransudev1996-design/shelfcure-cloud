import Link from 'next/link';
import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../lib/active-store';
import { PageHeader } from '../../../components/ui/page-header';

function fmtINR(n: number) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtCompact(n: number) {
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

interface SearchParams {
  searchParams: Promise<{ days?: string }>;
}

export default async function ReportsPage({ searchParams }: SearchParams) {
  const sp = await searchParams;
  const days = Math.max(7, Math.min(parseInt(sp.days ?? '30', 10) || 30, 90));

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">No store yet</h1>
        <Link href="/dashboard/stores" className="mt-4 inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800">
          Create your first store →
        </Link>
      </div>
    );
  }

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);

  const [trendRes, topRes, gstRes] = await Promise.all([
    supabase.rpc('rpc_report_sales_trend', { p_store_id: storeId, p_days: days }),
    supabase.rpc('rpc_report_top_medicines', { p_store_id: storeId, p_days: days, p_limit: 10 }),
    supabase.rpc('rpc_report_gst_summary', { p_store_id: storeId, p_from: monthStart, p_to: todayIso }),
  ]);

  const trend = (trendRes.data ?? []) as Array<{
    day: string;
    bill_count: number;
    total_amount: number;
    gst_amount: number;
  }>;
  const top = (topRes.data ?? []) as Array<{
    medicine_id: string;
    name: string;
    manufacturer: string;
    qty_sold: number;
    revenue: number;
    bills: number;
  }>;
  const gst = (gstRes.data ?? []) as Array<{
    gst_rate: number;
    taxable_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    total_amount: number;
    line_count: number;
  }>;

  const totalRevenue = trend.reduce((s, d) => s + Number(d.total_amount), 0);
  const totalBills = trend.reduce((s, d) => s + d.bill_count, 0);
  const totalGst = trend.reduce((s, d) => s + Number(d.gst_amount), 0);
  const avgBill = totalBills > 0 ? totalRevenue / totalBills : 0;
  const trendMax = Math.max(1, ...trend.map((d) => Number(d.total_amount)));

  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title={`Last ${days} days`}
        description="Sales trend, top sellers, and GST breakdown for the active store."
        actions={
          <div className="flex gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
            {[7, 30, 90].map((d) => (
              <Link
                key={d}
                href={`/dashboard/reports?days=${d}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  d === days
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        }
      />

      {/* KPI strip */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Revenue" value={fmtINR(totalRevenue)} sub={`${days} days`} tone="emerald" />
        <Kpi label="Bills" value={String(totalBills)} sub={`avg ${fmtINR(avgBill)} per bill`} />
        <Kpi label="GST collected" value={fmtINR(totalGst)} sub="CGST + SGST + IGST" />
        <Kpi label="Per day" value={fmtINR(totalRevenue / days)} sub="Average revenue" tone="violet" />
      </section>

      {/* Sales trend — simple inline bar chart, no chart lib */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Daily revenue</h3>
            <p className="text-xs text-zinc-500">Bars scaled to the highest-revenue day in the window.</p>
          </div>
        </div>
        {trend.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-400">No sales in this window.</div>
        ) : (
          <div className="flex h-44 items-end gap-1">
            {trend.map((d) => {
              const v = Number(d.total_amount);
              const pct = (v / trendMax) * 100;
              const isToday = d.day === todayIso;
              return (
                <div
                  key={d.day}
                  className="group relative flex flex-1 flex-col items-center justify-end"
                  title={`${fmtDay(d.day)} · ${fmtINR(v)} · ${d.bill_count} bills`}
                >
                  <div
                    className={`w-full rounded-t transition-all ${
                      isToday
                        ? 'bg-gradient-to-t from-emerald-600 to-emerald-400'
                        : 'bg-gradient-to-t from-zinc-700 to-zinc-400 group-hover:from-emerald-600 group-hover:to-emerald-400'
                    }`}
                    style={{ height: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              );
            })}
          </div>
        )}
        {trend.length > 0 && (
          <div className="mt-2 flex justify-between text-[10px] text-zinc-400">
            <span>{fmtDay(trend[0]!.day)}</span>
            <span>{fmtDay(trend[trend.length - 1]!.day)}</span>
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Top medicines */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-zinc-900">Top medicines</h3>
            <p className="text-xs text-zinc-500">Ranked by revenue. Top 10 in the selected window.</p>
          </div>
          {top.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-400">No sales in this window yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Medicine</th>
                  <th className="w-20 px-4 py-2.5 text-right">Bills</th>
                  <th className="w-20 px-4 py-2.5 text-right">Qty</th>
                  <th className="w-28 px-4 py-2.5 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {top.map((m, i) => (
                  <tr key={m.medicine_id} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-2 font-mono text-xs text-zinc-400">{i + 1}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-zinc-900">{m.name}</div>
                      <div className="text-xs text-zinc-500">{m.manufacturer || '—'}</div>
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-600">{m.bills}</td>
                    <td className="px-4 py-2 text-right font-mono text-zinc-700">{m.qty_sold}</td>
                    <td className="px-4 py-2 text-right font-mono font-medium text-zinc-900">
                      {fmtCompact(Number(m.revenue))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* GST summary */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-zinc-900">GST summary</h3>
            <p className="text-xs text-zinc-500">This month, by GST slab.</p>
          </div>
          {gst.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-400">No GST collected this month.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5">Slab</th>
                  <th className="px-3 py-2.5 text-right">Taxable</th>
                  <th className="px-3 py-2.5 text-right">GST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {gst.map((row) => {
                  const totalGst =
                    Number(row.cgst_amount) + Number(row.sgst_amount) + Number(row.igst_amount);
                  return (
                    <tr key={String(row.gst_rate)}>
                      <td className="px-3 py-2 font-mono text-zinc-700">{Number(row.gst_rate)}%</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-700">
                        {fmtCompact(Number(row.taxable_amount))}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-zinc-900">
                        {fmtCompact(totalGst)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-zinc-200 bg-zinc-50">
                  <td className="px-3 py-2.5 font-medium text-zinc-700">Total</td>
                  <td className="px-3 py-2.5 text-right font-mono font-medium text-zinc-900">
                    {fmtCompact(gst.reduce((s, r) => s + Number(r.taxable_amount), 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-medium text-zinc-900">
                    {fmtCompact(
                      gst.reduce(
                        (s, r) => s + Number(r.cgst_amount) + Number(r.sgst_amount) + Number(r.igst_amount),
                        0,
                      ),
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone = 'zinc',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'zinc' | 'emerald' | 'violet';
}) {
  const ring =
    tone === 'emerald' ? 'ring-emerald-200' : tone === 'violet' ? 'ring-violet-200' : 'ring-zinc-200';
  const accent =
    tone === 'emerald' ? 'text-emerald-700' : tone === 'violet' ? 'text-violet-700' : 'text-zinc-700';
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ${ring}`}>
      <div className={`text-xs font-medium uppercase tracking-wide ${accent}`}>{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-zinc-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
