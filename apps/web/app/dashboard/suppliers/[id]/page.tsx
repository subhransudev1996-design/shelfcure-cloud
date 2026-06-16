import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { getSupplierDetail, getSupplierLedger } from '@shelfcure/api-client';
import { SupplierDetailClient } from './supplier-detail-client';

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  const [detail, ledger] = await Promise.all([
    getSupplierDetail(supabase, id).catch(() => null),
    getSupplierLedger(supabase, id, { limit: 100 }).catch(() => []),
  ]);

  if (!detail) notFound();

  return <SupplierDetailClient detail={detail} ledger={ledger} />;
}
