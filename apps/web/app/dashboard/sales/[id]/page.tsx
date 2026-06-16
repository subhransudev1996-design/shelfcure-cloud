import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { getSaleDetail } from '@shelfcure/api-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

function fmtINR(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PAY_LABEL: Record<string, string> = {
  cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'Credit',
};

export default async function SaleDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const detail = await getSaleDetail(supabase, id).catch(() => null);
  if (!detail) notFound();

  const { sale, items, payments } = detail;

  const medicineItems = items.filter((i) => !i.is_misc_item);
  const miscItems = items.filter((i) => i.is_misc_item);
  const hasProfit = sale.cost_amount != null && sale.cost_amount > 0 && sale.gross_profit != null;

  return (
    <div className="space-y-4">
      {/* Sticky header strip */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/sales" className="text-xs text-zinc-500 hover:text-zinc-800">
            ← Sales History
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-zinc-900">Sale Invoice</h1>
            <span className="font-mono text-sm text-zinc-500">#{sale.bill_number}</span>
            {sale.is_fully_returned && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">Returned</span>
            )}
            {!sale.is_fully_returned && sale.is_returned && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">Partial Return</span>
            )}
            {sale.is_modified && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">Modified</span>
            )}
            {sale.is_prescription_sale && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">Prescription</span>
            )}
          </div>
        </div>

        {/* Action pills */}
        <div className="flex flex-wrap gap-2">
          {!sale.is_fully_returned && (
            <Link
              href={`/dashboard/sales/${sale.id}/return`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800 hover:bg-orange-100"
            >
              ↻ Process Return
            </Link>
          )}
          {!sale.is_fully_returned && (
            <Link
              href={`/dashboard/sales/${sale.id}/modify`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100"
            >
              ✏ Modify Bill
            </Link>
          )}
          <Link
            href={`/dashboard/sales/${sale.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-100"
          >
            🖨 Print Bill
          </Link>
          {sale.customer_phone && (
            <a
              href={`https://wa.me/91${sale.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Bill: ${sale.bill_number}\nDate: ${fmtDate(sale.bill_date)}\nTotal: ${fmtINR(sale.total_amount)}\nThank you for shopping at ${sale.store_name}!`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#20b958]"
            >
              💬 WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* 1/3 + 2/3 grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* LEFT COLUMN (1/3) */}
        <div className="space-y-4">
          {/* Invoice hero card */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Bill #{sale.bill_number}
            </div>
            <div className="mt-2 font-mono text-4xl font-black tracking-tighter text-zinc-900">
              {fmtINR(sale.total_amount)}
            </div>
            <div className="mt-1 text-sm text-zinc-500">{fmtDate(sale.bill_date)}</div>
            {sale.store_upi_vpa && (
              <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                <div className="mb-1 flex items-center justify-center gap-1.5 text-[10px] text-zinc-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Scan to Pay with any UPI App
                </div>
                <div className="text-xs font-mono text-zinc-700">{sale.store_upi_vpa}</div>
              </div>
            )}
          </div>

          {/* Customer card */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Customer</div>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-blue-600">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
                    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-zinc-900">{sale.customer_name}</div>
                {sale.customer_phone && <div className="text-xs text-zinc-500">{sale.customer_phone}</div>}
                {sale.customer_address && <div className="text-xs text-zinc-500">{sale.customer_address}</div>}
                {sale.customer_gstin && (
                  <div className="mt-0.5 font-mono text-[10px] text-zinc-400">GSTIN: {sale.customer_gstin}</div>
                )}
              </div>
            </div>
          </div>

          {/* Doctor Prescription card (conditional) */}
          {sale.is_prescription_sale && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-violet-500">
                Doctor Prescribed Bill
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-violet-600">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
                      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"
                      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-violet-900">
                    {sale.doctor_name_resolved ?? 'Prescription on file'}
                  </div>
                  {sale.doctor_specialization && (
                    <div className="text-xs text-violet-700">{sale.doctor_specialization}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Totals summary card */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="space-y-1 text-sm">
              <TotalRow label="Subtotal" value={sale.subtotal} />
              {(sale.cgst_amount ?? 0) > 0 && <TotalRow label="CGST" value={sale.cgst_amount} muted />}
              {(sale.sgst_amount ?? 0) > 0 && <TotalRow label="SGST" value={sale.sgst_amount} muted />}
              {(sale.igst_amount ?? 0) > 0 && <TotalRow label="IGST" value={sale.igst_amount} muted />}
              {(sale.discount_amount ?? 0) > 0 && (
                <div className="flex items-baseline justify-between text-emerald-700">
                  <span>Discount</span>
                  <span className="font-mono">-{fmtINR(sale.discount_amount)}</span>
                </div>
              )}
              {sale.special_discount_amount != null && sale.special_discount_amount > 0 && (
                <div className="flex items-baseline justify-between text-emerald-700">
                  <span>Special {sale.special_discount_label ? `(${sale.special_discount_label})` : 'Discount'}</span>
                  <span className="font-mono">-{fmtINR(sale.special_discount_amount)}</span>
                </div>
              )}
              {(sale.misc_charge ?? 0) > 0 && <TotalRow label="Misc Charges" value={sale.misc_charge!} muted />}
              {(sale.round_off ?? 0) !== 0 && <TotalRow label="Round off" value={sale.round_off} muted />}
              <div className="mt-2 border-t border-zinc-100 pt-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-zinc-700">Net Payable</span>
                  <span className="font-mono text-xl font-bold text-zinc-900">{fmtINR(sale.total_amount)}</span>
                </div>
              </div>
            </div>

            {/* Bill Profit chip */}
            {hasProfit && (
              <div className={`mt-3 rounded-xl px-3 py-2 ${(sale.gross_profit ?? 0) >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Bill Profit</div>
                <div className={`mt-0.5 flex items-baseline gap-2 font-mono font-semibold ${(sale.gross_profit ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  <span>{fmtINR(sale.gross_profit!)}</span>
                  {sale.profit_margin_pct != null && (
                    <span className="text-xs">({Number(sale.profit_margin_pct).toFixed(1)}%)</span>
                  )}
                </div>
              </div>
            )}

            {/* Paid amount after partial return */}
            {sale.is_returned && !sale.is_fully_returned && (
              <div className="mt-2 text-xs text-zinc-500">
                Paid after return: <span className="font-mono font-medium">{fmtINR(sale.paid_amount)}</span>
              </div>
            )}
          </div>

          {/* Payment Methods card */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Payment Methods</div>
            {payments.length === 0 ? (
              <div className="text-sm capitalize text-zinc-700">{PAY_LABEL[sale.payment_method] ?? sale.payment_method}</div>
            ) : (
              <ul className="space-y-1.5">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="capitalize text-zinc-700">{PAY_LABEL[p.payment_method] ?? p.payment_method}</span>
                      {p.reference_number && (
                        <span className="ml-2 text-xs text-zinc-400">· {p.reference_number}</span>
                      )}
                    </div>
                    <span className="font-mono text-zinc-900">{fmtINR(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (2/3) */}
        <div className="space-y-4 lg:col-span-2">
          {/* Items Sold */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white">
                  <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 0 0 1.946-.806 3.42 3.42 0 0 1 4.438 0 3.42 3.42 0 0 0 1.946.806 3.42 3.42 0 0 1 3.138 3.138 3.42 3.42 0 0 0 .806 1.946 3.42 3.42 0 0 1 0 4.438 3.42 3.42 0 0 0-.806 1.946 3.42 3.42 0 0 1-3.138 3.138 3.42 3.42 0 0 0-1.946.806 3.42 3.42 0 0 1-4.438 0 3.42 3.42 0 0 0-1.946-.806 3.42 3.42 0 0 1-3.138-3.138 3.42 3.42 0 0 0-.806-1.946 3.42 3.42 0 0 1 0-4.438 3.42 3.42 0 0 0 .806-1.946 3.42 3.42 0 0 1 3.138-3.138z"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="font-semibold text-zinc-900">Items Sold ({medicineItems.length})</h2>
            </div>
            <div className="space-y-2">
              {medicineItems.map((it) => {
                const hasReturn = it.returned_quantity > 0;
                const hasDiscount = it.discount_percentage > 0;
                const expiryDate = it.expiry_date ? new Date(it.expiry_date) : null;
                const daysLeft = expiryDate
                  ? Math.ceil((expiryDate.getTime() - Date.now()) / 86400000)
                  : null;
                return (
                  <div key={it.id} className="flex overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                    <div className="w-1.5 shrink-0 bg-indigo-500" />
                    <div className="min-w-0 flex-1 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-zinc-900">{it.medicine_name}</div>
                          {hasReturn && (
                            <span className="mt-0.5 inline-block rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                              {it.returned_quantity} unit Returned
                            </span>
                          )}
                          {hasDiscount && (
                            <span className="ml-1 mt-0.5 inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              {it.discount_percentage}% OFF
                            </span>
                          )}
                        </div>
                        <div className="shrink-0 font-mono text-xl font-bold text-indigo-600">{fmtINR(it.amount)}</div>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-1">
                        {[
                          ['BATCH', it.batch_number ?? '—'],
                          ['RATE', fmtINR(it.mrp)],
                          ['QTY', String(it.quantity)],
                          ['GST', `${it.gst_percentage}%`],
                        ].map(([stat, val]) => (
                          <div key={stat} className="rounded-lg bg-zinc-50 p-1.5 text-center">
                            <div className="text-[8px] font-bold uppercase tracking-widest text-zinc-400">{stat}</div>
                            <div className="mt-0.5 font-mono text-[11px] font-semibold text-zinc-700">{val}</div>
                          </div>
                        ))}
                      </div>
                      {it.expiry_date && daysLeft != null && daysLeft <= 90 && (
                        <div className={`mt-1.5 text-[10px] font-medium ${daysLeft < 0 ? 'text-red-600' : daysLeft <= 30 ? 'text-amber-600' : 'text-zinc-500'}`}>
                          Exp: {it.expiry_date.slice(0, 7)}{daysLeft < 0 ? ' — Expired' : daysLeft <= 30 ? ` — ${daysLeft}d left` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Misc / Note Charges (conditional) */}
          {miscItems.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500">
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="font-semibold text-zinc-900">Misc / Note Charges ({miscItems.length})</h2>
              </div>
              <div className="space-y-2">
                {miscItems.map((it) => (
                  <div key={it.id} className="flex overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
                    <div className="w-1.5 shrink-0 bg-amber-400" />
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2 p-3">
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Note / Service</div>
                        <div className="font-medium text-zinc-800">{it.misc_note ?? 'Misc Charge'}</div>
                      </div>
                      <div className="font-mono font-bold text-amber-700">{fmtINR(it.amount)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TotalRow({ label, value, muted = false }: { label: string; value: number | null | undefined; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between py-0.5 text-sm ${muted ? 'text-zinc-500' : 'text-zinc-700'}`}>
      <span>{label}</span>
      <span className="font-mono">{fmtINR(value ?? 0)}</span>
    </div>
  );
}
