import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { listSuppliers } from '@shelfcure/api-client';
import { SuppliersListClient } from './suppliers-list-client';

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const supabase = await getSupabaseServerClient();
  const { data: profile } = await supabase.from('user_profiles').select('role').single();
  const canManage = ['super_admin', 'store_admin', 'pharmacist'].includes(profile?.role ?? '');

  const f = (filter === 'balance' || filter === 'settled') ? filter : 'all';
  const suppliers = await listSuppliers(supabase, { filter: f }).catch(() => []);

  return <SuppliersListClient suppliers={suppliers} canManage={canManage} initialFilter={f} />;
}
