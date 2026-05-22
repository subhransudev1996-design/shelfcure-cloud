import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PageHeader } from '../../../components/ui/page-header';
import { MedicinesView } from './medicines-view';

export default async function MedicinesPage() {
  const supabase = await getSupabaseServerClient();

  const [{ data: profile }, { data: stores }, { data: dosageForms }] = await Promise.all([
    supabase.from('user_profiles').select('role, store_id').single(),
    supabase.from('stores').select('id, code, name').order('code'),
    supabase
      .from('dosage_forms')
      .select('*')
      .eq('is_active', true)
      .order('sort_order'),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Medicines"
        description="Search, add, and manage your medicine master."
      />
      <MedicinesView
        role={profile?.role ?? 'cashier'}
        userStoreId={profile?.store_id ?? null}
        stores={stores ?? []}
        dosageForms={dosageForms ?? []}
      />
    </>
  );
}
