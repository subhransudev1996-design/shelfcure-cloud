import Link from 'next/link';
import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../lib/active-store';
import { PageHeader } from '../../../components/ui/page-header';
import { EmptyState } from '../../../components/ui/empty-state';

const PAYMENT_TONE: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  partial: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtINR(n: number) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function PurchaseHistoryPage() {
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

  const { data } = await supabase.rpc('rpc_list_purchases', {
    p_store_id: storeId,
    p_limit: 100,
    p_offset: 0,
  });
  const rows = (data ?? []) as Array<{
    id: string;
    bill_number: string;
    bill_date: string;
    supplier_name: string;
    total_amount: number;
    payment_status: string;
  }>;

  return (
    <>
      <PageHeader
        eyebrow="Purchases"
        title="Purchase history"
        description="Stock received from suppliers. Click any bill to see line breakdown."
        actions={
          <Link
            href="/dashboard/purchases/new"
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
            </svg>
            New purchase
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path d="M3 7h13l3 4h2v7h-2a2 2 0 1 1-4 0H10a2 2 0 1 1-4 0H3V7Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          }
          title="No purchases yet"
          description="Record your first purchase to load stock into batches."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Bill #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50/60">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/purchases/${p.id}`} className="font-mono text-xs font-medium text-emerald-700 hover:text-emerald-800">
                      {p.bill_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{fmtDate(p.bill_date)}</td>
                  <td className="px-4 py-3 text-zinc-800">{p.supplier_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${PAYMENT_TONE[p.payment_status] ?? 'bg-zinc-100 text-zinc-700 ring-zinc-200'}`}>
                      {p.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-zinc-900">{fmtINR(p.total_amount)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/purchases/${p.id}`} className="text-xs text-zinc-500 hover:text-zinc-800">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
