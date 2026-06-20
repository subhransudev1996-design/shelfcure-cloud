import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSupabaseServerClient } from '../../lib/supabase/server';
import { AdminShell } from '../../components/admin-shell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, full_name, role, org_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) redirect('/unauthorized');
  if (profile.role !== 'super_admin') redirect('/unauthorized');

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, plan_tier')
    .eq('id', profile.org_id)
    .maybeSingle();

  return (
    <AdminShell
      user={{ fullName: profile.full_name, email: user.email ?? '', role: profile.role }}
      org={{ name: org?.name ?? 'Your organization', planTier: org?.plan_tier ?? 'solo' }}
    >
      {children}
    </AdminShell>
  );
}
