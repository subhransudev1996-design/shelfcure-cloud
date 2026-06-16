'use client';

import { useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReturnDetail } from '@shelfcure/api-client';

function fmtINR(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtIST(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  }) + ' IST';
}

const REFUND_LABEL: Record<string, string> = {
  cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'Credit',
  credit_note: 'Credit Note', neft: 'NEFT', adjustment: 'Adjustment',
};

interface Props { detail: ReturnDetail }

export function ReturnDetailClient({ detail }: Props) {
  const router = useRouter();
  const { return_record: rec, items } = detail;

  const handlePrint = useCallback(() => window.print(), []);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'p') { e.preventDefault(); handlePrint(); }
      if (e.key === 'Escape') router.push('/dashboard/returns');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, handlePrint]);

  // CSV export
  const exportCsv = useCallback(() => {
    const header = 'Return #,Return Date IST,Original Bill #,Customer,Medicine,Batch,Quantity,MRP,Refund Amount,Refund Method,Reason';
    const rows = items.map((it) =>
      [
        rec.return_number,
        fmtIST(rec.return_date),
        rec.bill_number,
        rec.customer_name,
        it.medicine_name,
        it.batch_number ?? '',
        it.quantity,
        it.mrp,
        it.amount,
        REFUND_LABEL[rec.refund_method] ?? rec.refund_method,
        rec.reason ?? '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','),
    );
    const csv = [header, ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `return-${rec.return_number}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [items, rec]);

  const subtotal = items.reduce((s, it) => s + Number(it.amount), 0);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="text-xs font-bold uppercase tracking-widest text-zinc-400">Return Details</div>

      {/* Header strip */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/returns" className="text-xs text-zinc-500 hover:text-zinc-800">← Back</Link>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-rose-500">
              <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-zinc-900">{rec.return_number}</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-zinc-700">
                Processed
              </span>
            </div>
            <div className="mt-1 space-y-0.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-28 font-black uppercase tracking-widest text-rose-600">Return Time</span>
                <span className="text-zinc-600">{fmtIST(rec.created_at)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-28 font-black uppercase tracking-widest text-indigo-600">Purchase Time</span>
                <span className="text-zinc-600">{fmtIST(rec.original_sale_date)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-6 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
          >
            🖨 Print
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-6 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
          >
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {/* 2/3 + 1/3 grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main column (2/3) */}
        <div className="space-y-4 lg:col-span-2">
          {/* Returned Items card */}
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
            {/* subtle blur blob */}
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-indigo-100/60 blur-2xl" />
            <div className="relative border-b border-zinc-100 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-indigo-600">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" strokeWidth="1.75" />
                  </svg>
                  <span className="text-lg font-black text-zinc-900">Returned Items</span>
                </div>
                <span className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                  {items.length} Items Total
                </span>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                <tr>
                  <th className="px-5 py-2">Medicine & Batch</th>
                  <th className="px-5 py-2 text-center">Quantity</th>
                  <th className="px-5 py-2 text-right">Refund Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-5 py-3">
                      <div className="font-semibold text-zinc-800 hover:text-indigo-700">{it.medicine_name}</div>
                      <div className="mt-0.5 text-[10px] text-zinc-400">
                        {it.batch_number && <span>BATCH: {it.batch_number}</span>}
                        {it.batch_number && <span className="mx-1">·</span>}
                        <span className="text-emerald-600">MRP: {fmtINR(it.mrp)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-1 text-sm font-semibold text-zinc-800 shadow-sm">
                        {it.quantity}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-lg font-black text-zinc-900">
                      {fmtINR(it.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer totals */}
            <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-4">
              <div className="ml-auto max-w-[280px] space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Subtotal</span>
                  <span className="font-mono font-bold text-zinc-700">{fmtINR(subtotal)}</span>
                </div>
                <div className="border-t border-zinc-200 pt-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Total Refund</span>
                    <span className="font-mono text-4xl font-black tracking-tighter text-rose-600 tabular-nums">
                      {fmtINR(rec.total_amount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Return Information card */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
              Return Information
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Reason for Return</div>
                <div className="mt-1 font-semibold text-zinc-800">{rec.reason ?? 'Not specified'}</div>
              </div>
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Processed By</div>
                <div className="mt-1 font-semibold text-zinc-800">{rec.processed_by_name || '—'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar (1/3) */}
        <div className="space-y-4">
          {/* Customer Details */}
          <div className="relative overflow-hidden rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" className="absolute right-4 top-4 h-16 w-16 text-zinc-900 opacity-5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
                stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="relative">
              <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-zinc-400">Customer Details</div>
              <div className="text-2xl font-black text-zinc-900">{rec.customer_name}</div>
              {rec.customer_phone && <div className="text-sm text-zinc-500">{rec.customer_phone}</div>}
              <div className="mt-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-zinc-400">Refund Method Issued</div>
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm">
                    {rec.refund_method === 'cash' ? (
                      <span className="text-emerald-600 font-bold">₹</span>
                    ) : (
                      <span className="text-indigo-600 font-bold">⊙</span>
                    )}
                  </div>
                  <span className="text-lg font-black uppercase tracking-widest text-zinc-900">
                    {REFUND_LABEL[rec.refund_method] ?? rec.refund_method}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Original Invoice */}
          <div className="relative overflow-hidden rounded-[2rem] border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" className="absolute right-4 top-4 h-16 w-16 text-indigo-900 opacity-10">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
                stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <div className="relative">
              <div className="mb-2 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-indigo-600">
                Original Invoice
                <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                  <path d="M7 17L17 7M7 7h10v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-3xl font-black text-zinc-900">{rec.bill_number}</div>
              <Link
                href={`/dashboard/sales/${rec.sale_id}`}
                className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-indigo-600 font-bold text-sm text-white hover:bg-indigo-700"
              >
                View Original Bill
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
