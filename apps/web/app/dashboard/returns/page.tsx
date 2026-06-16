import Link from 'next/link';
import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../lib/active-store';
import { listReturns, type SaleReturnListRow } from '@shelfcure/api-client';
import { ReturnsListClient } from './returns-list-client';

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; page?: string }>;
}) {
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

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const PER_PAGE = 100;

  const rows: SaleReturnListRow[] = await listReturns(supabase, {
    storeId,
    from: params.from,
    to: params.to,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  }).catch(() => []);

  return (
    <ReturnsListClient
      rows={rows}
      from={params.from}
      to={params.to}
      page={page}
      perPage={PER_PAGE}
    />
  );
}
