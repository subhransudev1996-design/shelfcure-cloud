import Link from 'next/link';
import { getSupabaseServerClient } from '../../lib/supabase/server';
import { resolveActiveStoreId } from '../../lib/active-store';
import {
  getDashboardStats,
  getDashboardChartData,
  getUpcomingRefills,
  getLowStockAlerts,
  type DashboardStats,
  type ChartDataPoint,
  type UpcomingRefillRow,
} from '@shelfcure/api-client';
import { DashboardChartCard } from './dashboard-chart-card';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DEFAULT_STATS: DashboardStats = {
  today_sale_count: 0, today_sales: 0, today_gst_collected: 0,
  today_purchases: 0, today_returns: 0, today_profit: 0,
  month_sale_count: 0, monthly_sales: 0, monthly_returns: 0, monthly_profit: 0,
  total_medicines: 0, total_stock_value: 0,
  low_stock_count: 0, expiry_soon_count: 0, expired_count: 0,
  outstanding_credit: 0, store_count: 0,
};

export default async function DashboardOverviewPage() {
  const supabase = await getSupabaseServerClient();

  const [{ data: org }, { data: profile }] = await Promise.all([
    supabase.from('organizations').select('name, plan_tier, billing_status, trial_ends_at').single(),
    supabase.from('user_profiles').select('full_name, role, store_id').single(),
  ]);

  const storeId = await resolveActiveStoreId(supabase);

  const [stats, chartData, refills, lowStock] = storeId
    ? await Promise.all([
        getDashboardStats(supabase, storeId).catch(() => DEFAULT_STATS),
        getDashboardChartData(supabase, storeId, 14).catch(() => [] as ChartDataPoint[]),
        getUpcomingRefills(supabase, storeId, 7).catch(() => [] as UpcomingRefillRow[]),
        getLowStockAlerts(supabase, storeId, 5).catch(() => []),
      ])
    : [DEFAULT_STATS, [] as ChartDataPoint[], [] as UpcomingRefillRow[], []];

  const trialDaysLeft = org?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))
    : null;
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  const groupedRefills = refills.reduce<Record<string, UpcomingRefillRow[]>>((acc, r) => {
    if (!acc[r.customer_id]) acc[r.customer_id] = [];
    acc[r.customer_id]!.push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Overview</p>
          <h1 className="mt-0.5 text-3xl font-bold text-zinc-900">Welcome back, {firstName}</h1>
          <p className="mt-1 text-sm text-zinc-500">Press <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px]">F1</kbd> for shortcuts</p>
        </div>
        {storeId && (
          <div className="flex gap-2">
            <Link
              href="/dashboard/purchases/new"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
            >
              Add Purchase
            </Link>
            <Link
              href="/dashboard/sales/new"
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
            >
              New Sale <kbd className="ml-1 hidden rounded border border-white/20 bg-white/10 px-1 font-mono text-[10px] sm:block">F2</kbd>
            </Link>
          </div>
        )}
      </div>

      {/* Expired-batches critical banner */}
      {stats.expired_count > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-600 to-red-500 p-4 shadow-lg">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-red-400/20 blur-2xl" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
                  <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white">Critical Action Needed</p>
                <p className="text-sm text-red-100">{stats.expired_count} expired {stats.expired_count === 1 ? 'batch has' : 'batches have'} stock — remove from shelves immediately.</p>
              </div>
            </div>
            <Link
              href="/dashboard/medicines"
              className="shrink-0 rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/30"
            >
              Review Now
            </Link>
          </div>
        </div>
      )}

      {/* Upcoming refills card (pinned when non-empty) */}
      {refills.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white">
                  <path d="M3 3h18v18H3z M9 3v18M15 3v18M3 9h18M3 15h18" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
              <h2 className="font-semibold text-emerald-900">Upcoming Customer Refills</h2>
            </div>
            <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-800">
              {refills.length} due
            </span>
          </div>
          <div className="space-y-2">
            {Object.values(groupedRefills).slice(0, 3).map((rows) => {
              const r = rows[0]!;
              const hasShortage = rows.some((x) => x.total_stock < x.min_stock_level);
              return (
                <div key={r.customer_id} className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-emerald-900">{r.customer_name}</span>
                      {r.customer_phone && <span className="text-xs text-zinc-500">{r.customer_phone}</span>}
                      {hasShortage && (
                        <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-700">Low Stock</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-600">{rows.map((x) => x.medicine_name).join(', ')}</div>
                  </div>
                  <div className="text-right text-xs">
                    {r.days_until_due != null && r.days_until_due < 0 ? (
                      <span className="font-semibold text-red-600">Overdue</span>
                    ) : r.days_until_due === 0 ? (
                      <span className="font-semibold text-amber-600">Today</span>
                    ) : (
                      <span className="text-zinc-600">In {r.days_until_due}d</span>
                    )}
                  </div>
                </div>
              );
            })}
            {Object.keys(groupedRefills).length > 3 && (
              <p className="text-center text-xs text-emerald-700">+{Object.keys(groupedRefills).length - 3} more customers</p>
            )}
          </div>
        </div>
      )}

      {/* Top 4 KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Today's Sales"
          value={INR(stats.today_sales)}
          sub={`${stats.today_sale_count} bills`}
          href="/dashboard/sales"
          tone="emerald"
        />
        <KpiCard
          label="Today's Profit"
          value={INR(stats.today_profit)}
          sub={`GST: ${INR(stats.today_gst_collected)}`}
          href="/dashboard/sales"
          tone="blue"
        />
        <KpiCard
          label="Monthly Revenue"
          value={INR(stats.monthly_sales)}
          sub={`${stats.month_sale_count} bills`}
          href="/dashboard/sales"
          tone="indigo"
        />
        <KpiCard
          label="Inventory Value"
          value={INR(stats.total_stock_value)}
          sub={`${stats.total_medicines} medicines`}
          href="/dashboard/medicines"
          tone="violet"
        />
      </section>

      {/* 2/3 chart + 1/3 sub-KPIs */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Chart (2/3) */}
        <div className="lg:col-span-2">
          <DashboardChartCard data={chartData} />
        </div>

        {/* Sub-KPIs (1/3) */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:content-start">
          <SubKpi
            label="Low Stock"
            value={stats.low_stock_count}
            href="/dashboard/medicines"
            warn={stats.low_stock_count > 0}
          />
          <SubKpi
            label="Expiring Soon"
            value={stats.expiry_soon_count}
            href="/dashboard/medicines"
            warn={stats.expiry_soon_count > 0}
          />
          <SubKpi
            label="O/S Credit"
            value={INR(stats.outstanding_credit)}
            href="/dashboard/customers?filter=outstanding"
            warn={stats.outstanding_credit > 0}
            isAmount
          />
          <SubKpi
            label="Today's Purchases"
            value={INR(stats.today_purchases)}
            href="/dashboard/purchases"
            isAmount
          />

          {/* Low stock alerts */}
          {lowStock.length > 0 && (
            <div className="col-span-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm lg:col-span-1">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Low Stock Alerts</div>
              <ul className="space-y-1">
                {lowStock.slice(0, 4).map((m) => (
                  <li key={m.medicine_id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-zinc-700">{m.name}</span>
                    <span className="ml-2 shrink-0 font-mono font-semibold text-red-600">{m.on_hand}</span>
                  </li>
                ))}
              </ul>
              {stats.low_stock_count > 4 && (
                <Link href="/dashboard/medicines" className="mt-2 block text-[10px] text-emerald-700 hover:text-emerald-800">
                  +{stats.low_stock_count - 4} more →
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Trial banner */}
      {trialDaysLeft !== null && (
        <div className="rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 p-5 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-200">
                  {org?.plan_tier ?? 'solo'}
                </span>
                <span className="font-semibold">{org?.name ?? 'Your organization'}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-300">
                <span className="font-medium text-emerald-300">{trialDaysLeft} days</span> left in trial
                {org?.trial_ends_at ? ` · ends ${new Date(org.trial_ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <QuickLink href="/dashboard/staff" label="Staff" />
              <QuickLink href="/dashboard/stores" label="Stores" />
              <QuickLink href="/dashboard/suppliers" label="Suppliers" />
              <QuickLink href="/dashboard/medicines" label="Medicines" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label, value, sub, href, tone = 'zinc',
}: {
  label: string; value: string; sub?: string; href: string;
  tone?: 'zinc' | 'emerald' | 'blue' | 'indigo' | 'violet';
}) {
  const tones = {
    zinc:   { bg: 'bg-zinc-50',   icon: 'bg-zinc-100 text-zinc-600',   val: 'text-zinc-900' },
    emerald:{ bg: 'bg-emerald-50',icon: 'bg-emerald-100 text-emerald-700', val: 'text-emerald-900' },
    blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-700',   val: 'text-blue-900' },
    indigo: { bg: 'bg-indigo-50', icon: 'bg-indigo-100 text-indigo-700', val: 'text-indigo-900' },
    violet: { bg: 'bg-violet-50', icon: 'bg-violet-100 text-violet-700', val: 'text-violet-900' },
  }[tone];

  return (
    <Link
      href={href}
      className={`group block rounded-2xl border border-zinc-200 ${tones.bg} p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-bold tabular-nums tracking-tight ${tones.val}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </Link>
  );
}

function SubKpi({
  label, value, href, warn, isAmount,
}: {
  label: string; value: string | number; href: string; warn?: boolean; isAmount?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`mt-1 font-mono font-semibold tabular-nums ${isAmount ? 'text-sm' : 'text-2xl'} ${warn ? 'text-amber-700' : 'text-zinc-900'}`}>
        {value}
      </div>
    </Link>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs hover:bg-white/10"
    >
      <span className="text-zinc-200">{label}</span>
      <span className="text-zinc-500">→</span>
    </Link>
  );
}
