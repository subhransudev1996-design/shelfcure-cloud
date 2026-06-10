import Link from 'next/link';
import { getPurchaseOrder } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { PurchaseClient } from './purchase-client';

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ poId?: string }>;
}) {
  const { poId } = await searchParams;
  const supabase = await getSupabaseServerClient();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, store_id')
    .single();

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
        <p className="mt-2 text-sm text-zinc-600">Create a store before recording purchases.</p>
        <Link
          href="/dashboard/stores"
          className="mt-6 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Go to Stores
        </Link>
      </div>
    );
  }

  const [{ data: storeRow }, { data: suppliers }] = await Promise.all([
    supabase.rpc('rpc_pos_get_store_context', { p_store_id: activeStoreId }).single(),
    supabase.rpc('rpc_list_suppliers', { p_store_id: activeStoreId }),
  ]);

  const purchaseOrder = poId ? await getPurchaseOrder(supabase, poId) : null;

  return (
    <PurchaseClient
      storeId={activeStoreId}
      storeName={storeRow?.store_name ?? 'Store'}
      storeCode={storeRow?.store_code ?? ''}
      initialSuppliers={(suppliers ?? []) as Array<{
        id: string;
        name: string;
        city: string;
        state: string;
        phone: string;
        gstin: string | null;
        is_active: boolean;
      }>}
      purchaseOrder={purchaseOrder}
    />
  );
}
