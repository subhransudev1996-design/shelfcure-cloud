import { notFound } from 'next/navigation';
import {
  getCustomerDetail,
  getCustomerLedger,
  getCustomerRoutine,
  listCustomerSales,
  listCustomerReturns,
} from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { CustomerDetailClient } from './customer-detail-client';

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  const [detail, ledger, routine, sales, returns_] = await Promise.all([
    getCustomerDetail(supabase, id).catch(() => null),
    getCustomerLedger(supabase, id, 30, 0).catch(() => []),
    getCustomerRoutine(supabase, id).catch(() => []),
    listCustomerSales(supabase, id, 20, 0).catch(() => []),
    listCustomerReturns(supabase, id, 20, 0).catch(() => []),
  ]);

  if (!detail || !detail.customer) notFound();

  return (
    <CustomerDetailClient
      detail={detail}
      ledger={ledger}
      routine={routine}
      sales={sales}
      returns={returns_}
    />
  );
}
