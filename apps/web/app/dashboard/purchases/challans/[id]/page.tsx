import { notFound } from 'next/navigation';
import { getChallanDetail } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../../../lib/supabase/server';
import { ChallanDetailClient } from './challan-detail-client';

export default async function ChallanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  try {
    const detail = await getChallanDetail(supabase, id);
    if (!detail?.challan) notFound();
    return <ChallanDetailClient detail={detail} />;
  } catch {
    notFound();
  }
}
