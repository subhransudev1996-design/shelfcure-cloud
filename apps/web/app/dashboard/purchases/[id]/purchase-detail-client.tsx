'use client';

import Link from 'next/link';
import type { PurchaseDetail, PurchaseDetailItem } from '@shelfcure/api-client';

function fmtINR(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtExpiry(iso: string | null | undefined) {
  if (!iso) return null;
  return iso.slice(0, 7); // YYYY-MM
}

function formatQtyFull(item: PurchaseDetailItem): string {
  const isFlexible = item.sale_unit_mode === 'both' && (item.units_per_pack ?? 1) > 1;
  const freeLabel = item.free_quantity > 0 ? ` + ${item.free_quantity} free` : '';
  if (!isFlexible) return `${item.quantity}${freeLabel}`;
  const upp = item.units_per_pack!;
  const strips = Math.floor(item.quantity / upp);
  const units = item.quantity % upp;
  if (units === 0) return `${strips} strips${freeLabel}`;
  return `${strips} str ${units} unit${freeLabel}`;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  partial: { label: 'Partial payment', className: 'bg-blue-50 border-blue-200 text-blue-700' },
  pending: { label: 'Payment pending', className: 'bg-amber-50 border-amber-200 text-amber-700' },
};

export function PurchaseDetailClient({ detail }: { detail: PurchaseDetail }) {
  const { purchase: p, items } = detail;

  const returnedSubtotal = items.reduce((s, it) => {
    if (it.returned_quantity <= 0) return s;
    const perUnit = it.amount / (it.quantity || 1);
    return s + perUnit * it.returned_quantity;
  }, 0);
  const paidAfterReturn =
    p.total_amount - returnedSubtotal > 0 ? p.total_amount - returnedSubtotal : null;
  const hasAnyReturn = items.some((it) => it.returned_quantity > 0);
  const isFullyReturned = items.every(
    (it) => it.returned_quantity >= it.quantity + it.free_quantity,
  );

  const statusCfg = STATUS_CONFIG[p.payment_status] ?? STATUS_CONFIG.pending!;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/purchases" className="text-xs text-zinc-500 hover:text-zinc-800">
            ← All purchases
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Purchase Invoice{' '}
              <span className="font-mono text-indigo-700">{p.bill_number}</span>
            </h1>
            {p.is_ai_scanned && (
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                AI Scanned
              </span>
            )}
            {isFullyReturned && (
              <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
                Fully Returned
              </span>
            )}
            {hasAnyReturn && !isFullyReturned && (
              <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-600">
                Partial Return
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            {fmtDate(p.bill_date)} · {p.store_name}
            <span className="ml-1 font-mono text-xs text-zinc-500">· {p.store_code}</span>
          </p>
        </div>
        {!isFullyReturned && (
          <Link
            href={`/dashboard/purchases/returns/new?bill=${encodeURIComponent(p.bill_number)}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-700"
          >
            Process return
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left sidebar */}
        <div className="space-y-4 lg:col-span-1">
          {/* Hero card */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-500">
              Bill #{p.bill_number}
            </p>
            <p className="mt-1 text-4xl font-black tracking-tighter text-indigo-900">
              {fmtINR(p.total_amount)}
            </p>
            <p className="mt-1 text-sm text-indigo-600">{fmtDate(p.bill_date)}</p>
          </div>

          {/* Supplier */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500">
                <path
                  d="M1 3h15l1 7H1V3ZM16 10l4 2v6h-5v-5H9v5H4v-6"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Supplier</span>
            </div>
            <p className="font-semibold text-zinc-900">{p.supplier_name ?? '—'}</p>
            {p.supplier_gstin && (
              <p className="mt-0.5 font-mono text-xs text-zinc-500">{p.supplier_gstin}</p>
            )}
          </div>

          {/* Summary */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <SummaryRow label="Subtotal" value={p.subtotal} />
            {p.gst_amount > 0 && <SummaryRow label="GST" value={p.gst_amount} muted />}
            {(p.discount_amount ?? 0) > 0 && (
              <SummaryRow label="Discount" value={-(p.discount_amount ?? 0)} muted emerald />
            )}
            <div className="my-2 border-t border-zinc-100" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-zinc-700">Net Payable</span>
              <span className="font-mono text-lg font-bold text-zinc-900">{fmtINR(p.total_amount)}</span>
            </div>
            {hasAnyReturn && !isFullyReturned && paidAfterReturn !== null && (
              <p className="mt-2 text-right text-xs text-zinc-500">
                Paid after return: <span className="font-mono font-medium">{fmtINR(paidAfterReturn)}</span>
              </p>
            )}
          </div>

          {/* Payment status banner */}
          <div className={`rounded-2xl border px-4 py-3 ${statusCfg.className}`}>
            <p className="text-xs font-bold uppercase tracking-wider opacity-70">Payment status</p>
            <p className="mt-0.5 font-semibold">{statusCfg.label}</p>
            {p.payment_method && (
              <p className="text-xs opacity-70 capitalize">{p.payment_method}</p>
            )}
          </div>

          {/* Notes */}
          {p.notes && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-zinc-500">Notes</p>
              <p className="text-sm text-zinc-700">{p.notes}</p>
            </div>
          )}
        </div>

        {/* Items list */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-500">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-indigo-600">
              <path
                d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2ZM16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
            Items ({items.length})
          </h2>
          <div className="space-y-3">
            {items.map((it) => {
              const hasReturn = it.returned_quantity > 0;
              return (
                <div
                  key={it.id}
                  className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
                >
                  <div className="flex items-start gap-0">
                    <div className="w-1.5 self-stretch bg-indigo-500" />
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-zinc-900">{it.medicine_name}</p>
                        <p className="shrink-0 font-mono text-base font-bold text-indigo-700">
                          {fmtINR(it.amount)}
                        </p>
                      </div>

                      {hasReturn && (
                        <p className="mt-0.5 text-xs font-semibold text-orange-600">
                          {it.returned_quantity} unit{it.returned_quantity !== 1 ? 's' : ''} returned
                        </p>
                      )}
                      {(it.discount_percentage ?? 0) > 0 && (
                        <p className="mt-0.5 text-xs font-semibold text-emerald-600">
                          {it.discount_percentage}% discount
                        </p>
                      )}

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <StatBox label="Batch" value={it.batch_number ?? '—'} />
                        <StatBox
                          label="Expiry"
                          value={fmtExpiry(it.expiry_date) ?? '—'}
                        />
                        <StatBox label="Qty" value={formatQtyFull(it)} mono />
                        <StatBox label="Rate" value={fmtINR(it.purchase_rate)} mono />
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <StatBox label="MRP" value={fmtINR(it.mrp)} mono />
                        <StatBox label="GST" value={`${it.gst_percentage}%`} />
                        {it.sale_unit_mode === 'both' && it.units_per_pack && (
                          <StatBox label="Units/pack" value={String(it.units_per_pack)} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  muted = false,
  emerald = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
  emerald?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between py-0.5 text-sm ${
        muted ? 'text-zinc-500' : 'text-zinc-700'
      }`}
    >
      <span>{label}</span>
      <span className={`font-mono ${emerald ? 'text-emerald-600' : ''}`}>{fmtINR(value)}</span>
    </div>
  );
}

function StatBox({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-xs font-semibold text-zinc-800 ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  );
}
