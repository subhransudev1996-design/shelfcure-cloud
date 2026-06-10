import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';

interface PageProps {
  params: Promise<{ id: string }>;
}

function fmtINR(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function PurchaseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc('rpc_get_purchase_detail', { p_purchase_id: id });
  if (error || !data) notFound();

  const detail = data as unknown as {
    purchase: {
      bill_number: string;
      bill_date: string;
      supplier_name: string;
      supplier_gstin: string | null;
      store_name: string;
      store_code: string;
      subtotal: number;
      gst_amount: number;
      discount_amount: number;
      total_amount: number;
      payment_status: string;
      notes: string | null;
    };
    items: Array<{
      id: string;
      medicine_name: string;
      batch_number: string | null;
      expiry_date: string | null;
      quantity: number;
      purchase_rate: number;
      mrp: number;
      gst_percentage: number;
      amount: number;
    }>;
  };

  const { purchase, items } = detail;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/purchases" className="text-xs text-zinc-500 hover:text-zinc-800">
            ← All purchases
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            Bill <span className="font-mono text-emerald-700">{purchase.bill_number}</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {fmtDate(purchase.bill_date)} · {purchase.store_name}
            <span className="ml-1 font-mono text-xs text-zinc-500">· {purchase.store_code}</span>
          </p>
        </div>
        <Link
          href={`/dashboard/purchases/return?bill=${encodeURIComponent(purchase.bill_number)}`}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-700"
        >
          Process return
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Supplier</div>
          <div className="mt-1 font-medium text-zinc-900">{purchase.supplier_name}</div>
          {purchase.supplier_gstin && (
            <div className="text-xs font-mono text-zinc-500">{purchase.supplier_gstin}</div>
          )}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Payment status</div>
          <div className="mt-1 font-medium uppercase text-zinc-900">{purchase.payment_status}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">Medicine</th>
              <th className="px-4 py-3">Batch · Exp</th>
              <th className="w-20 px-4 py-3 text-center">Qty</th>
              <th className="w-24 px-4 py-3 text-right">Rate</th>
              <th className="w-24 px-4 py-3 text-right">MRP</th>
              <th className="w-16 px-4 py-3 text-right">GST%</th>
              <th className="w-28 px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-2.5 font-medium text-zinc-900">{it.medicine_name}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-500">
                  {it.batch_number}
                  {it.expiry_date && <> · {it.expiry_date.slice(0, 7)}</>}
                </td>
                <td className="px-4 py-2.5 text-center text-zinc-700">{it.quantity}</td>
                <td className="px-4 py-2.5 text-right font-mono text-zinc-700">{fmtINR(it.purchase_rate)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-zinc-700">{fmtINR(it.mrp)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-zinc-500">{it.gst_percentage}%</td>
                <td className="px-4 py-2.5 text-right font-mono font-medium text-zinc-900">{fmtINR(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto max-w-xs rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <Row label="Subtotal" value={purchase.subtotal} />
        <Row label="GST" value={purchase.gst_amount} muted />
        {purchase.discount_amount > 0 && <Row label="Discount" value={-purchase.discount_amount} muted />}
        <div className="mt-2 border-t border-zinc-100 pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-zinc-700">Total</span>
            <span className="font-mono text-2xl font-semibold text-zinc-900">{fmtINR(purchase.total_amount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between py-0.5 text-sm ${muted ? 'text-zinc-500' : 'text-zinc-700'}`}>
      <span>{label}</span>
      <span className="font-mono">{fmtINR(value)}</span>
    </div>
  );
}
