import Link from 'next/link';
import { getSupabaseServerClient } from '../../lib/supabase/server';
import { resolveActiveStoreId } from '../../lib/active-store';
import { PageHeader } from '../../components/ui/page-header';

function fmtINR(n: number) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface Summary {
  today_sale_count: number;
  today_sale_total: number;
  today_gst_collected: number;
  month_sale_count: number;
  month_sale_total: number;
  low_stock_count: number;
  expiring_soon_count: number;
  store_count: number;
}

export default async function DashboardOverviewPage() {
  const supabase = await getSupabaseServerClient();

  const [{ data: org }, { data: profile }] = await Promise.all([
    supabase.from('organizations').select('name, plan_tier, billing_status, trial_ends_at').single(),
    supabase.from('user_profiles').select('full_name, role, store_id').single(),
  ]);

  const storeId = await resolveActiveStoreId(supabase);

  const summaryRaw = storeId
    ? (await supabase.rpc('rpc_dashboard_summary', { p_store_id: storeId })).data
    : null;

  const summary = ((summaryRaw as unknown) ?? {
    today_sale_count: 0,
    today_sale_total: 0,
    today_gst_collected: 0,
    month_sale_count: 0,
    month_sale_total: 0,
    low_stock_count: 0,
    expiring_soon_count: 0,
    store_count: 0,
  }) as Summary;

  const [lowStockRes, expiringRes, recentSalesRes] = storeId
    ? await Promise.all([
        supabase.rpc('rpc_low_stock_alerts', { p_store_id: storeId, p_limit: 5 }),
        supabase.rpc('rpc_expiring_batches', { p_store_id: storeId, p_days: 90, p_limit: 5 }),
        supabase.rpc('rpc_list_sales', { p_store_id: storeId, p_limit: 5, p_offset: 0 }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const lowStock = (lowStockRes.data ?? []) as Array<{
    medicine_id: string;
    name: string;
    on_hand: number;
    min_level: number;
  }>;
  const expiring = (expiringRes.data ?? []) as Array<{
    batch_id: string;
    medicine_name: string;
    batch_number: string;
    expiry_date: string;
    on_hand: number;
    days_left: number;
  }>;
  const recentSales = (recentSalesRes.data ?? []) as Array<{
    id: string;
    bill_number: string;
    bill_date: string;
    customer_name: string;
    total_amount: number;
  }>;

  const trialDaysLeft = org?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))
    : null;
  const firstName = profile?.full_name.split(' ')[0] ?? 'there';

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${firstName}`}
        description="Today at a glance — sales, stock alerts, and what needs attention."
        actions={
          storeId ? (
            <Link
              href="/dashboard/sales/new"
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
            >
              Start new sale
            </Link>
          ) : null
        }
      />

      {/* Today KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Today's sales" value={fmtINR(summary.today_sale_total)} sub={`${summary.today_sale_count} bills`} tone="emerald" />
        <Kpi label="GST collected today" value={fmtINR(summary.today_gst_collected)} sub="CGST + SGST + IGST" />
        <Kpi label="This month" value={fmtINR(summary.month_sale_total)} sub={`${summary.month_sale_count} bills`} />
        <Kpi
          label="Needs attention"
          value={String(summary.low_stock_count + summary.expiring_soon_count)}
          sub={`${summary.low_stock_count} low-stock · ${summary.expiring_soon_count} expiring`}
          tone="violet"
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Low stock */}
        <Panel
          title="Low stock"
          subtitle="Below minimum level"
          href="/dashboard/medicines"
          empty={lowStock.length === 0 ? 'Every medicine is above its minimum level.' : null}
        >
          <ul className="divide-y divide-zinc-100 text-sm">
            {lowStock.map((m) => (
              <li key={m.medicine_id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-medium text-zinc-900">{m.name}</div>
                  <div className="text-xs text-zinc-500">Min: {m.min_level}</div>
                </div>
                <div className="font-mono text-sm text-red-600">{m.on_hand} on hand</div>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Expiring soon */}
        <Panel
          title="Expiring soon"
          subtitle="Within 90 days"
          href="#"
          empty={expiring.length === 0 ? 'No batches expiring in the next 90 days.' : null}
        >
          <ul className="divide-y divide-zinc-100 text-sm">
            {expiring.map((b) => (
              <li key={b.batch_id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-medium text-zinc-900">{b.medicine_name}</div>
                  <div className="text-xs text-zinc-500">
                    Batch {b.batch_number} · {b.on_hand} units
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-amber-600">{b.days_left}d</div>
                  <div className="text-[10px] text-zinc-500">{fmtDate(b.expiry_date)}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Recent sales */}
        <Panel
          title="Recent sales"
          subtitle="Last 5 bills"
          href="/dashboard/sales"
          empty={recentSales.length === 0 ? 'No sales yet — start one from the POS.' : null}
        >
          <ul className="divide-y divide-zinc-100 text-sm">
            {recentSales.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <Link href={`/dashboard/sales/${s.id}`} className="font-mono text-xs font-medium text-emerald-700 hover:text-emerald-800">
                    {s.bill_number}
                  </Link>
                  <div className="text-xs text-zinc-500">
                    {s.customer_name} · {fmtDate(s.bill_date)}
                  </div>
                </div>
                <div className="font-mono text-sm font-medium text-zinc-900">{fmtINR(s.total_amount)}</div>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Account */}
        <div className="rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 p-6 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold tracking-tight">Account</h3>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-200">
              {org?.plan_tier ?? 'solo'}
            </span>
          </div>
          <div className="mt-3 text-sm text-zinc-300">
            <div className="font-medium text-white">{org?.name ?? 'Your organization'}</div>
            <div>
              {summary.store_count} {summary.store_count === 1 ? 'active store' : 'active stores'} ·{' '}
              {profile?.role?.replace('_', ' ')}
            </div>
          </div>
          {trialDaysLeft !== null && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
              <span className="font-medium text-emerald-300">{trialDaysLeft} days</span>
              <span className="text-zinc-300"> left in trial — ends {org?.trial_ends_at ? fmtDate(org.trial_ends_at) : '—'}.</span>
            </div>
          )}
          <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
            <QuickLink href="/dashboard/staff" label="Manage staff" />
            <QuickLink href="/dashboard/stores" label="Stores" />
            <QuickLink href="/dashboard/suppliers" label="Suppliers" />
            <QuickLink href="/dashboard/medicines" label="Medicines" />
          </div>
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
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ${ring} transition-all hover:shadow-md`}>
      <div className={`text-xs font-medium uppercase tracking-wide ${accent}`}>{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-zinc-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  href,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  href: string;
  empty: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
        </div>
        <Link href={href} className="text-xs font-medium text-emerald-700 hover:text-emerald-800">
          See all →
        </Link>
      </div>
      {empty ? <div className="py-6 text-center text-sm text-zinc-400">{empty}</div> : children}
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 hover:bg-white/10"
    >
      <span className="text-zinc-200">{label}</span>
      <span className="text-zinc-500">→</span>
    </Link>
  );
}
