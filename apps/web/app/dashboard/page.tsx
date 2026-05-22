import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '../../lib/supabase/server';
import { SignOutButton } from './sign-out-button';

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Find the user's profile + org. If no profile exists yet, send them to onboarding.
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

  return (
    <main style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0 }}>{org?.name ?? 'Your organization'}</h1>
          <p style={subStyle}>
            Plan: <strong>{org?.plan_tier ?? '—'}</strong> · Status:{' '}
            <strong>{org?.billing_status ?? '—'}</strong>
            {org?.trial_ends_at && (
              <> · Trial ends {new Date(org.trial_ends_at).toLocaleDateString()}</>
            )}
          </p>
        </div>
        <SignOutButton />
      </header>

      <section style={{ marginTop: '2rem' }}>
        <p>
          Signed in as <strong>{profile.full_name}</strong> ({profile.role}) ·{' '}
          <span style={{ color: '#666' }}>{user.email}</span>
        </p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>Stores ({stores?.length ?? 0})</h2>
        {!stores?.length ? (
          <p style={{ color: '#666' }}>
            No stores yet. (Adding stores from the dashboard lands in Phase 3.)
          </p>
        ) : (
          <ul>
            {stores.map((s) => (
              <li key={s.id}>
                <strong>{s.code}</strong> — {s.name}
                {s.city && <span style={{ color: '#666' }}> · {s.city}</span>}
                {!s.is_active && <span style={{ color: '#b00' }}> · disabled</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer style={{ marginTop: '3rem', color: '#888', fontSize: '0.85rem' }}>
        Phase 0 dashboard. Org + store + user management screens land in Phase 3.{' '}
        <Link href="/login">Back to login</Link>
      </footer>
    </main>
  );
}

const containerStyle: React.CSSProperties = {
  maxWidth: 880,
  margin: '3rem auto',
  padding: '2rem',
  fontFamily: 'system-ui, sans-serif',
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  borderBottom: '1px solid #eee',
  paddingBottom: '1rem',
};
const subStyle: React.CSSProperties = { color: '#666', margin: '0.25rem 0 0' };
