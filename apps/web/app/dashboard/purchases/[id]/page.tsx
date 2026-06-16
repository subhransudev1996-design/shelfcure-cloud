import { notFound } from 'next/navigation';
import { getPurchaseDetail } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { PurchaseDetailClient } from './purchase-detail-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PurchaseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  try {
    const detail = await getPurchaseDetail(supabase, id);
    if (!detail?.purchase) notFound();
    return <PurchaseDetailClient detail={detail} />;
  } catch {
    notFound();
  }
}
