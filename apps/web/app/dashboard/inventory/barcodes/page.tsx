import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { BarcodeGeneratorView } from './barcode-view';

interface Props {
  searchParams: Promise<{ id?: string }>;
}

export default async function BarcodeGeneratorPage({ searchParams }: Props) {
  const sp = await searchParams;
  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);

  if (!storeId) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">No store yet</h1>
        <Link href="/dashboard/stores" className="mt-4 inline-flex text-sm font-medium text-emerald-700">
          Create your first store →
        </Link>
      </div>
    );
  }

  return <BarcodeGeneratorView storeId={storeId} medicineFilterId={sp.id ?? null} />;
}
