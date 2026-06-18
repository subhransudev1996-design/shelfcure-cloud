import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { reportHourly, type HourlyReport, type HourlyHeatmapCell } from '@shelfcure/api-client';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fmtHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
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

export default async function HourlyPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const preset = sp.preset ?? '7d';
  const range = sp.from && sp.to ? { from: sp.from, to: sp.to } : presetRange(preset);

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const data = await reportHourly(supabase, storeId, range.from, range.to).catch(
    () => null as HourlyReport | null,
  );

  const heatmapDates = data ? Array.from(new Set(data.heatmap.map((c) => c.date))).sort() : [];
  const heatmapByKey = new Map<string, HourlyHeatmapCell>();
  if (data) {
    for (const cell of data.heatmap) heatmapByKey.set(`${cell.date}|${cell.hour}`, cell);
  }
  const maxHeatRevenue = data ? Math.max(...data.heatmap.map((c) => c.revenue), 1) : 1;
  const maxHourlyRevenue = data ? Math.max(...data.hourly.map((h) => h.revenue), 1) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-sky-600"><path d="M12 6v6l4 2m-4-8a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">Hourly Report</h1>
          <p className="text-xs text-zinc-400">Peak hours, hour-of-day sales pattern and activity heatmap</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          {PRESETS.map((p) => (
            <Link key={p.key} href={`/dashboard/reports/hourly?preset=${p.key}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${preset === p.key && !sp.from ? 'bg-sky-50 text-sky-800' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="py-16 text-center text-sm text-zinc-500">Failed to load hourly data.</div>
      ) : (
        <>
          <p className="text-xs text-zinc-400">
            {fmtDate(data.period.from)} → {fmtDate(data.period.to)}
          </p>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Total Bills</p>
              <p className="mt-1 text-xl font-black tabular-nums text-zinc-900">{data.summary.total_bills}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Total Revenue</p>
              <p className="mt-1 text-xl font-black tabular-nums text-emerald-700">{INR(data.summary.total_revenue)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Items Sold</p>
              <p className="mt-1 text-xl font-black tabular-nums text-zinc-900">{data.summary.total_items}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Peak Hour</p>
              <p className="mt-1 text-xl font-black tabular-nums text-sky-700">{fmtHour(data.summary.peak_hour)}</p>
              <p className="mt-0.5 text-[10px] text-zinc-400">{INR(data.summary.peak_hour_revenue)} revenue</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Avg Bills / Active Hr</p>
              <p className="mt-1 text-xl font-black tabular-nums text-zinc-900">{data.summary.avg_bills_per_active_hour}</p>
            </div>
          </div>

          {/* 24-hour bar chart */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Sales by Hour of Day</h3>
            </div>
            <div className="flex items-end gap-1 overflow-x-auto px-4 py-4" style={{ minHeight: 140 }}>
              {data.hourly.map((h) => {
                const heightPct = Math.max(2, (h.revenue / maxHourlyRevenue) * 100);
                const isPeak = h.hour === data.summary.peak_hour && h.revenue > 0;
                return (
                  <div key={h.hour} className="flex flex-col items-center gap-1" style={{ minWidth: 26 }}>
                    <div className="flex h-24 w-full items-end justify-center">
                      <div
                        className={`w-4 rounded-t ${isPeak ? 'bg-sky-600' : 'bg-sky-300'}`}
                        style={{ height: `${heightPct}%` }}
                        title={`${fmtHour(h.hour)}: ${INR(h.revenue)} · ${h.bill_count} bill${h.bill_count === 1 ? '' : 's'}`}
                      />
                    </div>
                    <span className={`text-[9px] ${isPeak ? 'font-bold text-sky-700' : 'text-zinc-400'}`}>{h.hour}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Date x Hour heatmap */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Activity Heatmap</h3>
            </div>
            {heatmapDates.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-zinc-400">No activity in this period</p>
            ) : (
              <div className="overflow-x-auto p-4">
                <table className="border-collapse text-[10px]">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-white px-2 py-1 text-left font-bold text-zinc-400">Date</th>
                      {Array.from({ length: 24 }, (_, h) => (
                        <th key={h} className="px-1 py-1 text-center font-bold text-zinc-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapDates.map((date) => (
                      <tr key={date}>
                        <td className="sticky left-0 whitespace-nowrap bg-white px-2 py-0.5 font-semibold text-zinc-600">{fmtDateShort(date)}</td>
                        {Array.from({ length: 24 }, (_, h) => {
                          const cell = heatmapByKey.get(`${date}|${h}`);
                          const intensity = cell ? Math.min(1, cell.revenue / maxHeatRevenue) : 0;
                          return (
                            <td key={h} className="p-0.5">
                              <div
                                className="h-4 w-4 rounded-sm"
                                style={{
                                  backgroundColor: cell ? `rgba(2, 132, 199, ${0.15 + intensity * 0.85})` : '#f4f4f5',
                                }}
                                title={cell ? `${fmtDateShort(date)} ${fmtHour(h)}: ${INR(cell.revenue)} · ${cell.bill_count} bill${cell.bill_count === 1 ? '' : 's'}` : undefined}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

