import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { getReturnDetail } from '@shelfcure/api-client';
import { ReturnDetailClient } from './return-detail-client';

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const detail = await getReturnDetail(supabase, id).catch(() => null);
  if (!detail) notFound();
  return <ReturnDetailClient detail={detail} />;
}
