'use client';

/**
 * Sale-return entry.
 *
 * Flow:
 *   1. Load the original bill's items (already done server-side).
 *   2. For each line, the cashier sets a return quantity (0..original_quantity).
 *   3. Refund total = sum(returned_qty / original_qty × original_amount).
 *   4. On submit: allocate a RET/YYYY-MM/0001-style return number from the
 *      shared bill_counters table, then rpcCommitSaleReturn (the RPC restocks
 *      the affected batches inside one transaction).
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  posNextBillNumber,
  rpcCommitSaleReturn,
  type SaleReturnLine,
  DomainError,
} from '@shelfcure/api-client';
import { round2 } from '@shelfcure/core';
import { getSupabaseBrowserClient } from '../../../../../lib/supabase/client';
import { Button } from '../../../../../components/ui/button';
import { Alert } from '../../../../../components/form-fields';

export interface OriginalSaleItem {
  sale_item_id: string;
  medicine_id: string;
  medicine_name: string;
  batch_id: string;
  batch_number: string | null;
  expiry_date: string | null;
  original_quantity: number;
  mrp: number;
  gst_percentage: number;
  original_amount: number;
}

type RefundMethod = 'cash' | 'upi' | 'card' | 'credit_note';

interface Props {
  saleId: string;
  storeId: string;
  customerId: string | null;
  billNumber: string;
  items: OriginalSaleItem[];
}

function fmtINR(n: number) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ReturnClient({ saleId, storeId, customerId, billNumber, items }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  // keyed by sale_item_id
  const [returnQty, setReturnQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((it) => [it.sale_item_id, 0])),
  );
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('cash');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setQty(saleItemId: string, qty: number) {
    const item = items.find((i) => i.sale_item_id === saleItemId);
    if (!item) return;
    const clamped = Math.max(0, Math.min(qty || 0, item.original_quantity));
    setReturnQty((prev) => ({ ...prev, [saleItemId]: clamped }));
  }

  const lines = useMemo(() => {
    return items
      .map((it) => {
        const qty = returnQty[it.sale_item_id] ?? 0;
        // Pro-rate the line's stored amount by qty share so refund math
        // exactly mirrors what the original bill charged (avoids re-running
        // GST extraction with different rounding).
        const refund = qty > 0 ? round2((qty / it.original_quantity) * it.original_amount) : 0;
        return { item: it, qty, refund };
      })
      .filter((l) => l.qty > 0);
  }, [items, returnQty]);

  const summary = useMemo(() => {
    const total = round2(lines.reduce((s, l) => s + l.refund, 0));
    // GST extracted same way the original bill did (MRP-inclusive).
    const gst = round2(
      lines.reduce((s, l) => {
        const taxable = l.refund / (1 + l.item.gst_percentage / 100);
        return s + (l.refund - taxable);
      }, 0),
    );
    return { total, gst, subtotal: round2(total - gst), lineCount: lines.length };
  }, [lines]);

  function selectAll() {
    setReturnQty(Object.fromEntries(items.map((it) => [it.sale_item_id, it.original_quantity])));
  }

  function clearAll() {
    setReturnQty(Object.fromEntries(items.map((it) => [it.sale_item_id, 0])));
  }

  async function onSubmit() {
    setError(null);
    if (lines.length === 0) {
      setError('Pick at least one item with a return quantity > 0.');
      return;
    }

    setSaving(true);
    try {
      const returnNumber = await posNextBillNumber(supabase, storeId, 'RET');
      const clientUuid = globalThis.crypto.randomUUID();

      const returnItems: SaleReturnLine[] = lines.map((l) => ({
        sale_item_id: l.item.sale_item_id,
        medicine_id: l.item.medicine_id,
        batch_id: l.item.batch_id,
        quantity: l.qty,
        amount: l.refund,
      }));

      const result = await rpcCommitSaleReturn(supabase, {
        client_uuid: clientUuid,
        store_id: storeId,
        sale_id: saleId,
        customer_id: customerId,
        return_number: returnNumber,
        subtotal: summary.subtotal,
        gst_amount: summary.gst,
        total_amount: summary.total,
        reason: reason.trim() || undefined,
        refund_method: refundMethod,
        items: returnItems,
      });

      router.push(`/dashboard/sales/${saleId}?returned=${encodeURIComponent(result.returnNumber)}`);
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to process return';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 shadow-sm">
        This bill has no returnable items.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/60 px-3 py-2 text-xs text-zinc-600">
          <span>
            Bill <span className="font-mono">{billNumber}</span> · {items.length}{' '}
            {items.length === 1 ? 'line' : 'lines'}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={selectAll} className="font-medium text-emerald-700 hover:text-emerald-800">
              Select all
            </button>
            <span className="text-zinc-300">|</span>
            <button type="button" onClick={clearAll} className="font-medium text-zinc-500 hover:text-zinc-800">
              Clear
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Medicine</th>
              <th className="px-3 py-2.5">Batch · Exp</th>
              <th className="w-20 px-3 py-2.5 text-center">Sold</th>
              <th className="w-24 px-3 py-2.5 text-center">Return</th>
              <th className="w-24 px-3 py-2.5 text-right">MRP</th>
              <th className="w-28 px-3 py-2.5 text-right">Refund</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((it) => {
              const qty = returnQty[it.sale_item_id] ?? 0;
              const refund = qty > 0 ? round2((qty / it.original_quantity) * it.original_amount) : 0;
              return (
                <tr key={it.sale_item_id} className={qty > 0 ? 'bg-emerald-50/30' : ''}>
                  <td className="px-3 py-2 font-medium text-zinc-900">{it.medicine_name}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {it.batch_number}
                    {it.expiry_date && <> · {it.expiry_date.slice(0, 7)}</>}
                  </td>
                  <td className="px-3 py-2 text-center text-zinc-700">{it.original_quantity}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={it.original_quantity}
                      value={qty}
                      onChange={(e) => setQty(it.sale_item_id, parseInt(e.target.value, 10) || 0)}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-700">{fmtINR(it.mrp)}</td>
                  <td className="px-3 py-2 text-right font-mono font-medium text-zinc-900">
                    {fmtINR(refund)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-600">Reason (optional)</span>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Damaged, wrong medicine, customer changed mind…"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>

          <div>
            <div className="mb-1.5 text-xs font-medium text-zinc-600">Refund via</div>
            <div className="flex flex-wrap gap-2">
              {(['cash', 'upi', 'card', 'credit_note'] as RefundMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRefundMethod(m)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                    refundMethod === m
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                  }`}
                >
                  {m.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {error && <Alert variant="error">{error}</Alert>}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Lines returning</span>
              <span>{summary.lineCount}</span>
            </div>
            <div className="mt-1 flex justify-between text-xs text-zinc-500">
              <span>Subtotal</span>
              <span className="font-mono">{fmtINR(summary.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-zinc-500">
              <span>GST</span>
              <span className="font-mono">{fmtINR(summary.gst)}</span>
            </div>
            <div className="mt-2 border-t border-zinc-100 pt-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-zinc-700">Refund</span>
                <span className="font-mono text-2xl font-semibold text-zinc-900">{fmtINR(summary.total)}</span>
              </div>
            </div>
          </div>

          <Button onClick={onSubmit} loading={saving} disabled={lines.length === 0} size="lg" className="w-full">
            Process return
          </Button>
          <p className="px-1 text-[11px] text-zinc-400">
            Stock will go back into the original batch. The original bill is marked returned.
          </p>
        </div>
      </div>
    </>
  );
}
