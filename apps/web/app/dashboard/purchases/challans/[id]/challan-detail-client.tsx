'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  acceptChallan,
  returnChallan,
  type ChallanDetail,
  type ChallanItemRecord,
  DomainError,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../../lib/supabase/client';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  partially_accepted: 'Partially Accepted',
  returned: 'Returned',
  expired: 'Expired',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  partially_accepted: 'border-blue-200 bg-blue-50 text-blue-700',
  returned: 'border-red-200 bg-red-50 text-red-600',
  expired: 'border-zinc-200 bg-zinc-50 text-zinc-500',
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  pending: 'text-amber-600',
  accepted: 'text-emerald-700',
  partial: 'text-blue-700',
  returned: 'text-red-600',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCurrency(n: number) {
  return `₹${n.toFixed(2)}`;
}

function daysLeft(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

interface AcceptLineState {
  [itemId: string]: number;
}

export function ChallanDetailClient({ detail }: { detail: ChallanDetail }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const { challan, items } = detail;
  const isPending = challan.status === 'pending';

  const [mode, setMode] = useState<'view' | 'accept'>('view');
  const [acceptQtys, setAcceptQtys] = useState<AcceptLineState>(() =>
    Object.fromEntries((items ?? []).map((it) => [it.id, it.returnable_quantity])),
  );
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'partial'>('pending');
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnConfirm, setReturnConfirm] = useState(false);

  const pendingItems = useMemo(() => (items ?? []).filter((it) => it.status === 'pending'), [items]);

  const soldWarning = useMemo(() => {
    return pendingItems.some((it) => it.sold_quantity > 0);
  }, [pendingItems]);

  const totalSold = useMemo(() => pendingItems.reduce((s, it) => s + it.sold_quantity, 0), [pendingItems]);

  // Estimated total for accept form
  const estimatedTotal = useMemo(() => {
    let total = 0;
    for (const it of pendingItems) {
      const qty = acceptQtys[it.id] ?? 0;
      const rate = it.purchase_rate;
      const base = rate * qty;
      total += base + base * it.gst_percentage / 100;
    }
    return total;
  }, [pendingItems, acceptQtys]);

  async function onAccept() {
    setError(null);
    setSaving(true);
    try {
      const result = await acceptChallan(supabase, {
        store_id: challan.store_id,
        challan_id: challan.id,
        payment_status: paymentStatus,
        paid_amount: paymentStatus === 'paid' ? estimatedTotal : paidAmount,
        payment_method: paymentMethod || null,
        items: pendingItems.map((it) => ({
          challan_item_id: it.id,
          accepted_quantity: acceptQtys[it.id] ?? 0,
        })),
      });
      if (result.purchase_id) {
        router.push(`/dashboard/purchases/${result.purchase_id}`);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to process challan');
    } finally {
      setSaving(false);
    }
  }

  async function onReturnAll() {
    setError(null);
    setSaving(true);
    try {
      await returnChallan(supabase, challan.id, challan.store_id);
      router.refresh();
    } catch (e) {
      setError(e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to return challan');
    } finally {
      setSaving(false);
      setReturnConfirm(false);
    }
  }

  const returnDeadlineDays = challan.expected_return_date ? daysLeft(challan.expected_return_date) : null;
  const returnUrgent = returnDeadlineDays !== null && returnDeadlineDays <= 3 && isPending;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${STATUS_COLORS[challan.status] ?? 'border-zinc-200 bg-zinc-100 text-zinc-500'}`}>
              {STATUS_LABELS[challan.status] ?? challan.status}
            </span>
            {returnUrgent && (
              <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-600">
                ⏰ {returnDeadlineDays}d left
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-zinc-900">Challan #{challan.challan_number}</h1>
          <p className="text-sm text-zinc-500">{challan.supplier_name} · {fmtDate(challan.challan_date)}</p>
        </div>
        {isPending && (
          <div className="flex gap-2">
            <button
              onClick={() => { setReturnConfirm(true); }}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
            >
              Return All
            </button>
            <button
              onClick={() => setMode(mode === 'accept' ? 'view' : 'accept')}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              {mode === 'accept' ? 'Cancel Accept' : 'Accept Items'}
            </button>
          </div>
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Supplier', value: challan.supplier_name ?? '—' },
          { label: 'Items / Units', value: `${challan.total_items} items · ${challan.total_quantity} units` },
          { label: 'Challan Date', value: fmtDate(challan.challan_date) },
          {
            label: 'Return Deadline',
            value: challan.expected_return_date
              ? `${fmtDate(challan.expected_return_date)}${returnUrgent ? ` (${returnDeadlineDays}d!)` : ''}`
              : 'No deadline',
          },
        ].map((card) => (
          <div key={card.label} className={`rounded-xl border p-4 ${returnUrgent && card.label === 'Return Deadline' ? 'border-red-200 bg-red-50' : 'border-zinc-200 bg-white'} shadow-sm`}>
            <p className="text-xs font-medium text-zinc-500">{card.label}</p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Linked purchase */}
      {challan.linked_purchase_id && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          ✅ Converted to Purchase Bill —{' '}
          <a href={`/dashboard/purchases/${challan.linked_purchase_id}`} className="underline">
            View purchase
          </a>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </div>
      )}

      {/* Items table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">Medicine</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">Batch</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">Rcvd</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">In Stock</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">Sold</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">Returnable</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">Rate</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500">Status</th>
                {mode === 'accept' && (
                  <th className="px-4 py-3 text-right text-xs font-semibold text-amber-600">Accept Qty</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(items ?? []).map((it: ChallanItemRecord) => (
                <tr key={it.id} className="hover:bg-zinc-50/60">
                  <td className="px-4 py-3 font-medium text-zinc-900">{it.medicine_name ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                    {it.batch_number}<br />
                    <span className="text-zinc-400">{it.expiry_date}</span>
                  </td>
                  <td className="px-4 py-3 text-right">{it.received_quantity}</td>
                  <td className="px-4 py-3 text-right">{it.current_stock}</td>
                  <td className="px-4 py-3 text-right text-orange-600">{it.sold_quantity}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{it.returnable_quantity}</td>
                  <td className="px-4 py-3 text-right">{fmtCurrency(it.purchase_rate)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-semibold uppercase ${ITEM_STATUS_COLORS[it.status] ?? 'text-zinc-500'}`}>
                      {it.status}
                    </span>
                  </td>
                  {mode === 'accept' && (
                    <td className="px-4 py-3 text-right">
                      {it.status === 'pending' ? (
                        <input
                          type="number"
                          min={0}
                          max={it.returnable_quantity}
                          value={acceptQtys[it.id] ?? 0}
                          onChange={(e) =>
                            setAcceptQtys((prev) => ({
                              ...prev,
                              [it.id]: Math.min(Number(e.target.value), it.returnable_quantity),
                            }))
                          }
                          className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-right text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        />
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Accept form */}
      {mode === 'accept' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-amber-800">Confirm Acceptance</h2>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600">Payment Status</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as 'pending' | 'paid' | 'partial')}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
              </select>
            </div>
            {paymentStatus === 'partial' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600">Amount Paid (₹)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={paidAmount || ''}
                  onChange={(e) => setPaidAmount(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
              >
                <option value="">— optional —</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm">
            <span className="text-zinc-600">
              Accepting {pendingItems.filter((it) => (acceptQtys[it.id] ?? 0) > 0).length} of {pendingItems.length} items
            </span>
            <span className="font-bold text-zinc-900">Estimated Total: {fmtCurrency(estimatedTotal)}</span>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setMode('view')}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              onClick={onAccept}
              disabled={saving}
              className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? 'Processing…' : 'Confirm & Create Purchase'}
            </button>
          </div>
        </div>
      )}

      {/* Return All confirmation modal */}
      {returnConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-zinc-900">Return Entire Challan?</h2>
            {soldWarning ? (
              <p className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
                ⚠️ {totalSold} units have already been sold and will be <strong>AUTO-ACCEPTED</strong>. Only unsold stock will be returned to the supplier.
              </p>
            ) : (
              <p className="mb-4 text-sm text-zinc-600">
                All items will be returned to the supplier. Any unsold provisional stock will be removed from inventory.
              </p>
            )}
            {error && (
              <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setReturnConfirm(false)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={onReturnAll}
                disabled={saving}
                className="rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Processing…' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
