import Link from 'next/link';
import { listPurchaseOrders } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { PageHeader } from '../../../../components/ui/page-header';
import { OrdersList } from './orders-list';

export default async function PurchaseOrdersPage() {
  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">No store yet</h1>
        <Link href="/dashboard/stores" className="mt-4 inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800">
          Create your first store →
        </Link>
      </div>
    );
  }

  const orders = await listPurchaseOrders(supabase, storeId, 'pending');

  return (
    <>
      <PageHeader
        eyebrow="Purchases"
        title="Pending reorders"
        description="View and convert requested stock into purchase bills."
      />
      <OrdersList orders={orders} />
    </>
  );
}
