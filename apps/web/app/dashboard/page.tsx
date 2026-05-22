import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '../../lib/supabase/server';
import { Brand } from '../../components/brand';
import { SignOutButton } from './sign-out-button';

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, full_name, role, store_id, org_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) redirect('/onboarding');

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, plan_tier, billing_status, trial_ends_at')
    .eq('id', profile.org_id)
    .maybeSingle();

  const { data: stores } = await supabase
    .from('stores')
    .select('id, code, name, city, is_active')
    .order('code', { ascending: true });

  const initials =
    profile.full_name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

  const trialDaysLeft = org?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Top nav */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Brand size="sm" />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight text-zinc-900">
                {profile.full_name}
              </div>
              <div className="text-xs text-zinc-500">{user.email}</div>
            </div>
            <div
              className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-sm font-semibold text-white shadow-sm"
              aria-hidden
            >
              {initials}
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Hero */}
        <section className="animate-fade-in-up">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Organization
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900">
                {org?.name ?? 'Your organization'}
              </h1>
              <p className="mt-1.5 text-sm text-zinc-600">
                Welcome back, {profile.full_name.split(' ')[0]}.
              </p>
            </div>
            <RoleBadge role={profile.role} />
          </div>
        </section>

        {/* Stat cards */}
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <StatCard label="Role" value={cap(profile.role.replace('_', ' '))} sub="Your access level" />
        </section>

        {/* Stores section */}
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Stores</h2>
              <p className="text-sm text-zinc-500">Manage your pharmacy locations.</p>
            </div>
            <button
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-500"
              disabled
              title="Adding stores lands in Phase 3"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Add store
            </button>
          </div>

          {!stores?.length ? (
            <EmptyStores />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((s) => (
                <li
                  key={s.id}
                  className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-mono font-medium uppercase tracking-wide text-emerald-700">
                        {s.code}
                      </div>
                      <div className="mt-1 text-base font-semibold text-zinc-900">{s.name}</div>
                      {s.city && <div className="text-sm text-zinc-500">{s.city}</div>}
                    </div>
                    {!s.is_active && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                        Disabled
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-16 border-t border-zinc-200 pt-6">
          <p className="text-xs text-zinc-500">
            Phase 0 preview · Auth + onboarding shipped. Stores/users/billing/transfers land in
            Phase 3+.
          </p>
        </footer>
      </main>
    </div>
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
    <div
      className={`group rounded-2xl bg-white p-5 shadow-sm ring-1 ${ring} transition-all hover:shadow-md`}
    >
      <div className={`text-xs font-medium uppercase tracking-wide ${accent}`}>{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white">
      <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
        <path
          d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      {cap(role.replace('_', ' '))}
    </span>
  );
}

function EmptyStores() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-zinc-300 bg-white/50 p-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
          <path
            d="M3 9l9-6 9 6v11a2 2 0 0 1-2 2h-4v-7H10v7H6a2 2 0 0 1-2-2V9Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="mt-4 text-base font-semibold text-zinc-900">No stores yet</h3>
      <p className="mt-1 text-sm text-zinc-500">
        Store creation lands in Phase 3. Hang tight — the foundation is in place.
      </p>
    </div>
  );
}
