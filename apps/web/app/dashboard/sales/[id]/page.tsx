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

export default async function SaleDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc('rpc_get_sale_detail', { p_sale_id: id });
  if (error || !data) notFound();

  const detail = data as unknown as {
    sale: {
      id: string;
      bill_number: string;
      bill_date: string;
      customer_name: string;
      customer_phone: string | null;
      store_name: string;
      store_code: string;
      created_by_name: string;
      subtotal: number;
      gst_amount: number;
      cgst_amount: number;
      sgst_amount: number;
      igst_amount: number;
      discount_amount: number;
      round_off: number;
      total_amount: number;
      payment_method: string;
      payment_status: string;
      paid_amount: number;
      notes: string | null;
      is_returned: boolean;
      is_fully_returned: boolean;
    };
    items: Array<{
      id: string;
      medicine_name: string;
      batch_number: string | null;
      expiry_date: string | null;
      quantity: number;
      mrp: number;
      gst_percentage: number;
      amount: number;
    }>;
    payments: Array<{ payment_method: string; amount: number; reference_number: string | null }>;
  };

  const { sale, items, payments } = detail;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard/sales" className="text-xs text-zinc-500 hover:text-zinc-800">
            ← All sales
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            Bill <span className="font-mono text-emerald-700">{sale.bill_number}</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {fmtDate(sale.bill_date)} · {sale.store_name}
            <span className="ml-1 font-mono text-xs text-zinc-500">· {sale.store_code}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {!sale.is_fully_returned && (
            <Link
              href={`/dashboard/sales/${sale.id}/return`}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 shadow-sm hover:bg-amber-100"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 5 5v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Process return
            </Link>
          )}
          <Link
            href={`/dashboard/sales/${sale.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6v-8Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
            </svg>
            Print bill
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard label="Customer">
          <div className="font-medium text-zinc-900">{sale.customer_name}</div>
          {sale.customer_phone && (
            <div className="text-xs text-zinc-500">{sale.customer_phone}</div>
          )}
        </InfoCard>
        <InfoCard label="Cashier">
          <div className="font-medium text-zinc-900">{sale.created_by_name || '—'}</div>
        </InfoCard>
        <InfoCard label="Payment">
          <div className="font-medium uppercase text-zinc-900">{sale.payment_method}</div>
          <div className="text-xs text-zinc-500">
            {sale.payment_status} · paid {fmtINR(sale.paid_amount)}
          </div>
        </InfoCard>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">Medicine</th>
              <th className="px-4 py-3">Batch · Exp</th>
              <th className="w-20 px-4 py-3 text-center">Qty</th>
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
                <td className="px-4 py-2.5 text-right font-mono text-zinc-700">{fmtINR(it.mrp)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-zinc-500">{it.gst_percentage}%</td>
                <td className="px-4 py-2.5 text-right font-mono font-medium text-zinc-900">{fmtINR(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Payments</div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {payments.length === 0 ? (
              <li className="text-zinc-400">No payment records.</li>
            ) : (
              payments.map((p, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="uppercase text-zinc-700">{p.payment_method}</span>
                  <span className="font-mono text-zinc-900">{fmtINR(p.amount)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <TotalRow label="Subtotal" value={sale.subtotal} />
          {sale.cgst_amount > 0 && <TotalRow label="CGST" value={sale.cgst_amount} muted />}
          {sale.sgst_amount > 0 && <TotalRow label="SGST" value={sale.sgst_amount} muted />}
          {sale.igst_amount > 0 && <TotalRow label="IGST" value={sale.igst_amount} muted />}
          {sale.discount_amount > 0 && <TotalRow label="Discount" value={-sale.discount_amount} muted />}
          {sale.round_off !== 0 && <TotalRow label="Round off" value={sale.round_off} muted />}
          <div className="mt-2 border-t border-zinc-100 pt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-zinc-700">Total</span>
              <span className="font-mono text-2xl font-semibold text-zinc-900">{fmtINR(sale.total_amount)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function TotalRow({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between py-0.5 text-sm ${muted ? 'text-zinc-500' : 'text-zinc-700'}`}>
      <span>{label}</span>
      <span className="font-mono">{fmtINR(value)}</span>
    </div>
  );
}
