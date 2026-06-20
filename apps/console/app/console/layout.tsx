import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSupabaseServerClient } from '../../lib/supabase/server';
import { ConsoleShell } from '../../components/console-shell';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: whoami } = await supabase.rpc('rpc_console_whoami');
  const admin = whoami as { id: string; full_name: string; is_active: boolean } | null;
  if (!admin || !admin.is_active) redirect('/unauthorized');

  return (
    <ConsoleShell admin={{ fullName: admin.full_name, email: user.email ?? '' }}>
      {children}
    </ConsoleShell>
  );
}
