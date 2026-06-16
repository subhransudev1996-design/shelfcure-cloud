import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { getDoctorDetail, getDoctorSales, getDoctorCommissionPayouts } from '@shelfcure/api-client';
import { DoctorDetailClient } from './doctor-detail-client';

export default async function DoctorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  const [detail, sales, payouts] = await Promise.all([
    getDoctorDetail(supabase, id).catch(() => null),
    getDoctorSales(supabase, id).catch(() => []),
    getDoctorCommissionPayouts(supabase, id).catch(() => []),
  ]);

  if (!detail) notFound();

  return <DoctorDetailClient detail={detail} initialSales={sales} payouts={payouts} />;
}
