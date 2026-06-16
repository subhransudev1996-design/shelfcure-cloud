import Link from 'next/link';
import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../lib/active-store';
import { listSales, type SaleListRow } from '@shelfcure/api-client';
import { SalesHistoryClient } from './sales-history-client';

export default async function SalesHistoryPage({
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
  const PER_PAGE = 50;
  const page = Math.max(1, Number(params.page ?? 1));

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(today.getDate() - 30);
  const isoFrom = defaultFrom.toISOString().slice(0, 10);
  const isoTo = today.toISOString().slice(0, 10);

  const from = params.from ?? isoFrom;
  const to = params.to ?? isoTo;

  const rows: SaleListRow[] = await listSales(supabase, {
    storeId,
    from,
    to,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  }).catch(() => []);

  return (
    <SalesHistoryClient
      rows={rows}
      from={from}
      to={to}
      page={page}
      perPage={PER_PAGE}
      storeId={storeId}
    />
  );
}
