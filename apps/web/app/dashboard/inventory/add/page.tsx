import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { listCategories } from '@shelfcure/api-client';
import { MedicineForm } from '../_components/medicine-form';

export default async function AddMedicinePage() {
  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);

  if (!storeId) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">No store yet</h1>
        <Link href="/dashboard/stores" className="mt-4 inline-flex text-sm font-medium text-emerald-700">
          Create your first store →
        </Link>
      </div>
    );
  }

  const [{ data: dosageForms }, categories] = await Promise.all([
    supabase.from('dosage_forms').select('*').eq('is_active', true).order('sort_order'),
    listCategories(supabase, storeId),
  ]);

  return (
    <MedicineForm
      mode="create"
      dosageForms={dosageForms ?? []}
      initialCategories={categories}
      storeId={storeId}
    />
  );
}
