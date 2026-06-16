import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../../lib/active-store';
import { ChallanClient } from './challan-client';

export default async function NewChallanPage() {
  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);

  if (!storeId) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">No store available</h1>
        <p className="mt-2 text-sm text-zinc-600">Create a store before recording challans.</p>
        <Link
          href="/dashboard/stores"
          className="mt-6 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Go to Stores
        </Link>
      </div>
    );
  }

  const { data: suppliers } = await supabase.rpc('rpc_list_suppliers', { p_store_id: storeId });

  return (
    <ChallanClient
      storeId={storeId}
      initialSuppliers={(suppliers ?? []) as Array<{
        id: string;
        name: string;
        city: string;
        state: string;
        phone: string;
        gstin: string | null;
        is_active: boolean;
      }>}
    />
  );
}
