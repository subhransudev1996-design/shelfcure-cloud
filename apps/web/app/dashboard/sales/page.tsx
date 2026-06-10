import Link from 'next/link';
import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../lib/active-store';
import { PageHeader } from '../../../components/ui/page-header';
import { EmptyState } from '../../../components/ui/empty-state';

const PAYMENT_TONE: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  partial: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  credit: 'bg-sky-50 text-sky-700 ring-sky-200',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtINR(n: number) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function SalesHistoryPage() {
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

  const { data } = await supabase.rpc('rpc_list_sales', {
    p_store_id: storeId,
    p_limit: 100,
    p_offset: 0,
  });
  const rows = (data ?? []) as Array<{
    id: string;
    bill_number: string;
    bill_date: string;
    customer_name: string;
    total_amount: number;
    payment_method: string;
    payment_status: string;
    is_returned: boolean;
    created_at: string;
    created_by_name: string;
  }>;

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Sales history"
        description="Recent bills for the active store. Click any bill to see the line breakdown."
        actions={
          <Link
            href="/dashboard/sales/new"
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
            </svg>
            New sale
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path d="M5 7h14l-1.5 11a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 7Z M9 7V5a3 3 0 1 1 6 0v2"
                stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          }
          title="No sales yet"
          description="Once you record sales in the POS, they will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Bill #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Cashier</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50/60">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/sales/${s.id}`} className="font-mono text-xs font-medium text-emerald-700 hover:text-emerald-800">
                      {s.bill_number}
                    </Link>
                    {s.is_returned && (
                      <span className="ml-2 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-200">
                        Returned
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{fmtDate(s.bill_date)}</td>
                  <td className="px-4 py-3 text-zinc-800">{s.customer_name}</td>
                  <td className="px-4 py-3 text-zinc-500">{s.created_by_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium uppercase text-zinc-500">
                      {s.payment_method}
                    </span>
                    <span className={`ml-2 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${PAYMENT_TONE[s.payment_status] ?? 'bg-zinc-100 text-zinc-700 ring-zinc-200'}`}>
                      {s.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-zinc-900">
                    {fmtINR(s.total_amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/sales/${s.id}`} className="text-xs text-zinc-500 hover:text-zinc-800">
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
