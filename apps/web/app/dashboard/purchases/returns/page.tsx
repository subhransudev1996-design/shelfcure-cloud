import Link from 'next/link';
import { listPurchaseReturns } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { PageHeader } from '../../../../components/ui/page-header';
import { EmptyState } from '../../../../components/ui/empty-state';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtINR(n: number) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function PurchaseReturnsPage() {
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

  const returns = await listPurchaseReturns(supabase, storeId, 100);
  const totalValue = returns.reduce((s, r) => s + Number(r.total_amount), 0);

  return (
    <>
      <PageHeader
        eyebrow="Purchases"
        title="Purchase returns"
        description="Goods sent back to suppliers."
        actions={
          <Link
            href="/dashboard/purchases/return"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-700"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
            </svg>
            New return
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Total returns</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">{returns.length}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Total value returned</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-orange-700">{fmtINR(totalValue)}</div>
        </div>
      </div>

      {returns.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path d="M9 14l-4-4 4-4M5 10h10a4 4 0 0 1 4 4v3" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          }
          title="No purchase returns yet"
          description="Process a return when goods go back to a supplier."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {returns.map((r) => (
            <Link
              key={r.id}
              href={`/dashboard/purchases/returns/${r.id}`}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-orange-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-mono text-xs font-medium text-zinc-500">{r.return_number}</div>
                {r.bill_number && (
                  <div className="font-mono text-[10px] text-zinc-400">Bill {r.bill_number}</div>
                )}
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">{r.supplier_name ?? '—'}</div>
              <div className="mt-2 font-mono text-xl font-semibold text-orange-700">{fmtINR(r.total_amount)}</div>
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                <span>{fmtDate(r.return_date)}</span>
                <span>{r.item_count} item{r.item_count === 1 ? '' : 's'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
