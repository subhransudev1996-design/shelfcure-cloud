import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPurchaseReturnDetail } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../../../lib/supabase/server';
import { Alert } from '../../../../../components/form-fields';
import { ReturnDetailActions } from './return-detail-actions';

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
function fmtSalesQty(qty: number, upp: number, mode: string) {
  if (mode === 'both' && upp > 1) {
    const packs = Math.floor(qty / upp);
    const units = qty % upp;
    const parts: string[] = [];
    if (packs > 0) parts.push(`${packs} pack${packs === 1 ? '' : 's'}`);
    if (units > 0) parts.push(`${units} unit${units === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' ') : '0';
  }
  return `${qty}`;
}

export default async function PurchaseReturnDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  let detail;
  try {
    detail = await getPurchaseReturnDetail(supabase, id);
  } catch {
    notFound();
  }
  if (!detail) notFound();

  const { header, items, items_incomplete, items_sum } = detail;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/purchases/returns" className="text-xs text-zinc-500 hover:text-zinc-800">
            ← All purchase returns
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            Return <span className="font-mono text-orange-700">{header.return_number}</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-600">{fmtDate(header.return_date)}</p>
        </div>
        <ReturnDetailActions returnId={header.id} returnNumber={header.return_number} reason={header.reason} items={items} />
      </div>

      {/* Hero */}
      <div className="rounded-2xl bg-orange-600 p-6 text-white shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wider text-orange-100">Return value</div>
        <div className="mt-1 font-mono text-4xl font-semibold">{fmtINR(header.total_amount)}</div>
        <div className="mt-1 text-sm text-orange-100">{header.return_number}</div>
      </div>

      {items_incomplete && (
        <Alert variant="info">
          ⚠ Items total ({fmtINR(items_sum)}) does not match the return total ({fmtINR(header.total_amount)}). Some line items may be missing.
        </Alert>
      )}

      {/* Info cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Supplier</div>
          <div className="mt-1 font-medium text-zinc-900">{header.supplier_name ?? '—'}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Original bill</div>
          <div className="mt-1 font-medium text-zinc-900">
            {header.bill_number ? (
              header.purchase_id ? (
                <Link href={`/dashboard/purchases/${header.purchase_id}`} className="font-mono text-emerald-700 hover:underline">
                  {header.bill_number}
                </Link>
              ) : (
                <span className="font-mono">{header.bill_number}</span>
              )
            ) : '—'}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">When purchased</div>
          <div className="mt-1 font-medium text-zinc-900">{fmtDate(header.bill_date)}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">When returned</div>
          <div className="mt-1 font-medium text-zinc-900">{fmtDate(header.return_date)}</div>
        </div>
        {header.reason && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:col-span-2">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Reason</div>
            <div className="mt-1 text-zinc-700">{header.reason}</div>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">Medicine</th>
              <th className="px-4 py-3">Batch</th>
              <th className="w-32 px-4 py-3 text-center">Qty returned</th>
              <th className="w-24 px-4 py-3 text-right">Purchase rate</th>
              <th className="w-16 px-4 py-3 text-right">GST%</th>
              <th className="w-28 px-4 py-3 text-right">Return value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-2.5 font-medium text-zinc-900">{it.medicine_name ?? 'Unknown medicine'}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-500">{it.batch_number ?? '—'}</td>
                <td className="px-4 py-2.5 text-center text-zinc-700">{fmtSalesQty(it.quantity, it.units_per_pack, it.sale_unit_mode)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-zinc-700">{fmtINR(it.purchase_rate)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-zinc-500">{it.gst_percentage}%</td>
                <td className="px-4 py-2.5 text-right font-mono font-medium text-zinc-900">{fmtINR(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Financial summary */}
      <div className="ml-auto max-w-xs rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <Row label="Subtotal" value={header.subtotal} />
        <Row label="GST" value={header.gst_amount} muted />
        <div className="mt-2 border-t border-zinc-100 pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-zinc-700">Total return</span>
            <span className="font-mono text-2xl font-semibold text-orange-700">{fmtINR(header.total_amount)}</span>
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
