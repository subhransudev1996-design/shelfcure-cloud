import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSupabaseServerClient } from '../../lib/supabase/server';
import { DashboardShell } from '../../components/dashboard-shell';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
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
    .select('id, name, plan_tier')
    .eq('id', profile.org_id)
    .maybeSingle();

  return (
    <DashboardShell
      user={{ fullName: profile.full_name, email: user.email ?? '', role: profile.role }}
      org={{ name: org?.name ?? 'Your organization', planTier: org?.plan_tier ?? 'solo' }}
    >
      {children}
    </DashboardShell>
  );
}
