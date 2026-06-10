import Link from 'next/link';
import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../lib/active-store';
import { PageHeader } from '../../../components/ui/page-header';
import { InventoryView } from './inventory-view';

export default async function InventoryPage() {
  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);

  if (!storeId) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">No store yet</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Inventory is per-store. Create a store, then come back here.
        </p>
        <Link
          href="/dashboard/stores"
          className="mt-4 inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          Create your first store →
        </Link>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .single();

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Medicines & stock"
        description="Search, manage and adjust your medicine master. Batches, pricing and stock live on each medicine's detail page."
      />
      <InventoryView storeId={storeId} role={profile?.role ?? 'cashier'} />
    </>
  );
}
