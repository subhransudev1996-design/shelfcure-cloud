import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { PosClient } from './pos-client';

export default async function NewSalePage() {
  const supabase = await getSupabaseServerClient();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, store_id')
    .single();

  // Resolve the store this sale is going against.
  // store-scoped roles (store_admin/pharmacist/cashier) → their assigned store.
  // org-scoped roles (super_admin/accountant) → first active store in the org.
  let activeStoreId = profile?.store_id ?? null;
  if (!activeStoreId) {
    const { data: stores } = await supabase
      .from('stores')
      .select('id')
      .eq('is_active', true)
      .order('code', { ascending: true })
      .limit(1);
    activeStoreId = stores?.[0]?.id ?? null;
  }

  if (!activeStoreId) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">No store available</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Create a store before recording sales.
        </p>
        <Link
          href="/dashboard/stores"
          className="mt-6 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Go to Stores
        </Link>
      </div>
    );
  }

  // Server-side fetch store context + org_id (needed for prescription image upload path).
  const [{ data: ctxRow }, { data: storeRow }] = await Promise.all([
    supabase.rpc('rpc_pos_get_store_context', { p_store_id: activeStoreId }).single(),
    supabase.from('stores').select('org_id').eq('id', activeStoreId).single(),
  ]);

  return (
    <PosClient
      storeId={activeStoreId}
      storeName={ctxRow?.store_name ?? 'Store'}
      storeCode={ctxRow?.store_code ?? ''}
      storeState={ctxRow?.store_state ?? ''}
      orgName={ctxRow?.org_name ?? ''}
      orgId={storeRow?.org_id ?? ''}
    />
  );
}
