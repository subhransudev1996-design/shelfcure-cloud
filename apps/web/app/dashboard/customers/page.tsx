import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PageHeader } from '../../../components/ui/page-header';
import { CustomersView } from './customers-view';

export default async function CustomersPage() {
  const supabase = await getSupabaseServerClient();

  const [{ data: profile }, { data: stores }] = await Promise.all([
    supabase.from('user_profiles').select('role, store_id').single(),
    supabase.from('stores').select('id, code, name').order('code'),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Patients"
        title="Customers"
        description="Walk-in patients and B2B accounts."
      />
      <CustomersView
        role={profile?.role ?? 'cashier'}
        userStoreId={profile?.store_id ?? null}
        stores={stores ?? []}
      />
    </>
  );
}
