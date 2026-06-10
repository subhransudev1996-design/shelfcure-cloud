import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { getMedicineDetail } from '@shelfcure/api-client';
import { DetailView } from './detail-view';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MedicineDetailPage({ params }: Props) {
  const { id } = await params;
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

  let detail;
  try {
    detail = await getMedicineDetail(supabase, { medicineId: id, storeId });
  } catch {
    notFound();
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .single();

  return <DetailView storeId={storeId} initial={detail} role={profile?.role ?? 'cashier'} />;
}
