'use client';

/**
 * Stock listing + adjustment modal.
 *
 * Each row is a single batch. Adjusting goes through rpc_stock_correction
 * which writes a stock_movement row alongside updating batches.current_quantity,
 * so the audit trail is preserved.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { listStockBatches, rpcStockCorrection, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { Field, Alert } from '../../../components/form-fields';

export interface StockBatchView {
  batch_id: string;
  medicine_id: string;
  medicine_name: string;
  manufacturer: string;
  batch_number: string;
  expiry_date: string;
  on_hand: number;
  mrp: number;
  purchase_rate: number;
  gst_percentage: number;
  days_to_expiry: number;
  is_blocked: boolean;
}

type AdjustReason =
  | 'damage'
  | 'expired'
  | 'theft_or_loss'
  | 'audit_correction'
  | 'returned_to_supplier'
  | 'other';

const REASON_LABEL: Record<AdjustReason, string> = {
  damage: 'Damaged',
  expired: 'Expired',
  theft_or_loss: 'Lost / theft',
  audit_correction: 'Audit correction',
  returned_to_supplier: 'Returned to supplier',
  other: 'Other',
};

function fmtINR(n: number) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function expiryTone(days: number, blocked: boolean): string {
  if (blocked) return 'bg-zinc-100 text-zinc-700 ring-zinc-200';
  if (days < 0) return 'bg-red-50 text-red-700 ring-red-200';
  if (days <= 30) return 'bg-amber-50 text-amber-800 ring-amber-200';
  if (days <= 90) return 'bg-yellow-50 text-yellow-800 ring-yellow-200';
  return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
}

export function StockClient({
  storeId,
  initial,
}: {
  storeId: string;
  initial: StockBatchView[];
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<StockBatchView[]>(initial);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Adjust modal state
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [target, setTarget] = useState<StockBatchView | null>(null);
  const [mode, setMode] = useState<'remove' | 'add'>('remove');
  const [delta, setDelta] = useState<number>(1);
  const [reason, setReason] = useState<AdjustReason>('damage');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deltaInputRef = useRef<HTMLInputElement | null>(null);

  // Debounced refresh on search
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await listStockBatches(supabase, { storeId, query, limit: 200 });
        setRows(data);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query, storeId, supabase]);

  function openAdjust(batch: StockBatchView) {
    setTarget(batch);
    setMode('remove');
    setDelta(1);
    setReason(batch.days_to_expiry < 0 ? 'expired' : 'damage');
    setNote('');
    setError(null);
    setAdjustOpen(true);
    setTimeout(() => deltaInputRef.current?.focus(), 50);
  }

  async function onSubmitAdjust() {
    if (!target) return;
    setError(null);
    const magnitude = Math.max(0, Math.floor(delta || 0));
    if (magnitude === 0) {
      setError('Enter a quantity greater than 0.');
      return;
    }
    const signedDelta = mode === 'remove' ? -magnitude : magnitude;
    if (mode === 'remove' && magnitude > target.on_hand) {
      setError(`Cannot remove more than the ${target.on_hand} units on hand.`);
      return;
    }

    setSaving(true);
    try {
      const reasonText = note.trim()
        ? `${REASON_LABEL[reason]}: ${note.trim()}`
        : REASON_LABEL[reason];

      await rpcStockCorrection(supabase, {
        batchId: target.batch_id,
        delta: signedDelta,
        reason: reasonText,
        clientUuid: globalThis.crypto.randomUUID(),
      });

      // Optimistic local update so the row reflects immediately.
      setRows((prev) =>
        prev.map((r) =>
          r.batch_id === target.batch_id ? { ...r, on_hand: r.on_hand + signedDelta } : r,
        ),
      );
      setAdjustOpen(false);
      setTarget(null);
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to adjust stock';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search medicine or batch number…"
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">…</span>
          )}
        </div>
        <div className="ml-auto text-xs text-zinc-500">
          {rows.length} batches
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-3">Medicine</th>
              <th className="px-3 py-3">Batch</th>
              <th className="px-3 py-3">Expiry</th>
              <th className="w-24 px-3 py-3 text-right">On hand</th>
              <th className="w-24 px-3 py-3 text-right">MRP</th>
              <th className="w-20 px-3 py-3 text-right">GST%</th>
              <th className="w-24 px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((b) => (
              <tr key={b.batch_id} className="hover:bg-zinc-50/60">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-zinc-900">{b.medicine_name}</div>
                  <div className="text-xs text-zinc-500">{b.manufacturer || '—'}</div>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-zinc-700">{b.batch_number}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${expiryTone(b.days_to_expiry, b.is_blocked)}`}>
                    {b.days_to_expiry < 0 ? `Exp ${-b.days_to_expiry}d ago` : `${b.days_to_expiry}d left`}
                  </span>
                  <div className="mt-0.5 text-[10px] text-zinc-500">{b.expiry_date.slice(0, 7)}</div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-medium text-zinc-900">
                  {b.on_hand}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-700">{fmtINR(b.mrp)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-500">{b.gst_percentage}%</td>
                <td className="px-3 py-2.5 text-right">
                  <Button size="sm" variant="secondary" onClick={() => openAdjust(b)}>
                    Adjust
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={adjustOpen}
        onClose={() => { setAdjustOpen(false); setTarget(null); }}
        title="Adjust stock"
        description={target ? `${target.medicine_name} · Batch ${target.batch_number}` : ''}
        maxWidth="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={onSubmitAdjust} loading={saving}>Save adjustment</Button>
          </>
        }
      >
        {target && (
          <div className="space-y-4">
            <div className="rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Currently on hand: <span className="font-mono font-medium">{target.on_hand}</span>
              {' · '}Expiry {target.expiry_date.slice(0, 7)}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('remove')}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                  mode === 'remove'
                    ? 'border-red-500 bg-red-50 text-red-800 ring-2 ring-red-500/20'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                }`}
              >
                Remove stock
              </button>
              <button
                type="button"
                onClick={() => setMode('add')}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                  mode === 'add'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                }`}
              >
                Add stock
              </button>
            </div>

            <Field
              ref={deltaInputRef}
              label="Quantity"
              type="number"
              min={1}
              max={mode === 'remove' ? target.on_hand : 99999}
              value={delta}
              onChange={(e) => setDelta(parseInt(e.target.value, 10) || 0)}
              hint={mode === 'remove' ? `Max ${target.on_hand} units` : 'Use only for correcting a miscount — do NOT add new stock here. Use a purchase entry instead.'}
            />

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-zinc-800">Reason</span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as AdjustReason)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {(Object.keys(REASON_LABEL) as AdjustReason[]).map((r) => (
                  <option key={r} value={r}>
                    {REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>

            <Field
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Free-text detail — appears in the audit log."
            />

            {error && <Alert variant="error">{error}</Alert>}

            <div className="rounded-xl bg-zinc-900 px-3 py-2.5 text-xs text-zinc-200">
              After adjustment:{' '}
              <span className="font-mono text-white">
                {target.on_hand + (mode === 'remove' ? -Math.abs(delta || 0) : Math.abs(delta || 0))} units
              </span>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
