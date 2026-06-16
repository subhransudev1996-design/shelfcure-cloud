import Link from 'next/link';
import { listPurchases } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../lib/active-store';
import { PageHeader } from '../../../components/ui/page-header';
import { PurchaseList } from './purchase-list';

export default async function PurchaseHistoryPage() {
  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);

  if (!storeId) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">No store yet</h1>
        <Link
          href="/dashboard/stores"
          className="mt-4 inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          Create your first store →
        </Link>
      </div>
    );
  }

  const purchases = await listPurchases(supabase, storeId, undefined, undefined, 200);

  return (
    <>
      <PageHeader
        eyebrow="Purchases"
        title="Purchases"
        description="Stock received from suppliers — bills, challans, reorders and returns."
      />
      <PurchaseList purchases={purchases} storeId={storeId} />
    </>
  );
}
