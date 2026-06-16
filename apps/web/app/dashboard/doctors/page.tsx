import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { listDoctors } from '@shelfcure/api-client';
import { DoctorsListClient } from './doctors-list-client';

export default async function DoctorsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: profile } = await supabase.from('user_profiles').select('role').single();
  const canManage = ['super_admin', 'store_admin', 'pharmacist'].includes(profile?.role ?? '');

  const doctors = await listDoctors(supabase, { includeInactive: true }).catch(() => []);

  return <DoctorsListClient doctors={doctors} canManage={canManage} />;
}
