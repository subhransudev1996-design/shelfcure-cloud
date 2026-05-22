import { getSupabaseServerClient } from '../../lib/supabase/server';
import { PageHeader } from '../../components/ui/page-header';

export default async function DashboardOverviewPage() {
  const supabase = await getSupabaseServerClient();

  const [{ data: org }, { data: profile }, { data: stores }, { data: medicines }, { data: customers }] =
    await Promise.all([
      supabase.from('organizations').select('name, plan_tier, billing_status, trial_ends_at').single(),
      supabase.from('user_profiles').select('full_name, role').single(),
      supabase.from('stores').select('id', { count: 'exact', head: false }),
      supabase.from('medicines').select('id', { count: 'exact', head: false }).is('deleted_at', null),
      supabase.from('customers').select('id', { count: 'exact', head: false }).is('deleted_at', null),
    ]);

  const trialDaysLeft = org?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))
    : null;

  const firstName = profile?.full_name.split(' ')[0] ?? 'there';

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${firstName}`}
        description="Here's a snapshot of your organization right now."
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Plan"
          value={cap(org?.plan_tier ?? '—')}
          sub={org?.billing_status ? cap(org.billing_status) : '—'}
          tone="emerald"
        />
        <StatCard
          label="Trial"
          value={trialDaysLeft !== null ? `${trialDaysLeft} days left` : '—'}
          sub={org?.trial_ends_at ? `Ends ${fmtDate(org.trial_ends_at)}` : ''}
          tone="violet"
        />
        <StatCard label="Stores" value={String(stores?.length ?? 0)} sub="Total locations" />
        <StatCard label="Medicines" value={String(medicines?.length ?? 0)} sub="Active SKUs" tone="emerald" />
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-2">
        <ActivityCard
          title="Getting started"
          steps={[
            {
              done: (stores?.length ?? 0) > 0,
              label: 'Add your first store',
              href: '/dashboard/stores',
            },
            {
              done: (medicines?.length ?? 0) > 0,
              label: 'Add medicines',
              href: '/dashboard/medicines',
            },
            {
              done: (customers?.length ?? 0) > 0,
              label: 'Add your first customer',
              href: '/dashboard/customers',
            },
            { done: false, label: 'Invite a teammate (coming soon)', href: '#' },
          ]}
        />
        <NextStepsCard />
      </section>
    </>
  );
}

// ---------- helpers ----------

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function StatCard({
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
    tone === 'emerald'
      ? 'ring-emerald-200'
      : tone === 'violet'
        ? 'ring-violet-200'
        : 'ring-zinc-200';
  const accent =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'violet'
        ? 'text-violet-700'
        : 'text-zinc-700';

  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ${ring} transition-all hover:shadow-md`}>
      <div className={`text-xs font-medium uppercase tracking-wide ${accent}`}>{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function ActivityCard({
  title,
  steps,
}: {
  title: string;
  steps: { done: boolean; label: string; href: string }[];
}) {
  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
      <div className="flex items-end justify-between">
        <h3 className="text-base font-semibold tracking-tight text-zinc-900">{title}</h3>
        <span className="text-xs font-medium text-zinc-500">
          {completed} / {steps.length}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="mt-5 space-y-2.5">
        {steps.map((s) => (
          <li key={s.label}>
            <a
              href={s.href}
              className="group flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-zinc-50"
            >
              {s.done ? (
                <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
                  <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                    <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              ) : (
                <span className="h-5 w-5 rounded-full border-2 border-zinc-300" />
              )}
              <span className={s.done ? 'text-zinc-500 line-through' : 'text-zinc-800 group-hover:text-zinc-900'}>
                {s.label}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NextStepsCard() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 p-6 text-white shadow-sm">
      <h3 className="text-base font-semibold tracking-tight">What&apos;s next</h3>
      <p className="mt-1 text-sm text-zinc-300">
        Phase 0 + early Phase 1 is live: auth, onboarding, stores, medicines, customers. Coming up:
        purchases, sales (POS), reports, billing, and the offline-first desktop terminal.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
        {['Suppliers', 'Doctors', 'Sales (POS)', 'Reports', 'Billing', 'Desktop app'].map((label) => (
          <div
            key={label}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5"
          >
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-zinc-200">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
