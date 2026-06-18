import type { GrowthKpi } from '@shelfcure/api-client';

// Shared period-comparison primitives used by Overall Performance, Profit
// Tracking, and Growth Trend (WEB_PARITY_PLAN §2.11.0).

export function KpiDelta({ kpi, suppress }: { kpi: GrowthKpi; suppress: boolean }) {
  if (suppress) return null;
  const pct = Number(kpi.delta_pct);
  const positive = pct > 0;
  const flat = pct === 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
        flat ? 'bg-zinc-100 text-zinc-500' : positive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {!flat && (positive ? '▲' : '▼')}
      {flat ? '—' : `${Math.abs(pct).toFixed(1)}%`}
    </span>
  );
}

export function KpiCard({
  label,
  kpi,
  format,
  suppress,
  tone = 'text-zinc-900',
}: {
  label: string;
  kpi: GrowthKpi;
  format: (n: number) => string;
  suppress: boolean;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</p>
        <KpiDelta kpi={kpi} suppress={suppress} />
      </div>
      <p className={`mt-1 text-xl font-black tabular-nums ${tone}`}>{format(Number(kpi.current))}</p>
      {!suppress && (
        <p className="mt-0.5 text-[10px] text-zinc-400">vs {format(Number(kpi.previous))} previous</p>
      )}
    </div>
  );
}
