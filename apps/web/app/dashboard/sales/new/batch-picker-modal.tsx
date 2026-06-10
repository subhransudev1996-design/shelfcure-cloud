'use client';

import { useEffect, useMemo, useState } from 'react';
import { posListBatchesForMedicine, type PosBatchOption } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Modal } from '../../../../components/ui/modal';
import { Button } from '../../../../components/ui/button';

interface Props {
  open: boolean;
  storeId: string;
  medicineId: string;
  medicineName: string;
  currentBatchId: string;
  onClose: () => void;
  onPick: (batch: PosBatchOption) => void;
}

/**
 * Lists every in-stock, non-expired batch for a medicine and lets the cashier
 * swap the cart line's batch. Sorted FEFO; current batch shows a "CURRENT" pill.
 */
export function BatchPickerModal({
  open, storeId, medicineId, medicineName, currentBatchId, onClose, onPick,
}: Props) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState<PosBatchOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null);
    posListBatchesForMedicine(supabase, storeId, medicineId)
      .then((rows) => {
        setBatches(rows);
        // Highlight the current batch if present, else first row.
        const idx = rows.findIndex((b) => b.batch_id === currentBatchId);
        setHighlight(idx >= 0 ? idx : 0);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load batches'))
      .finally(() => setLoading(false));
  }, [open, supabase, storeId, medicineId, currentBatchId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, batches.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = batches[highlight];
        if (pick && pick.batch_id !== currentBatchId) onPick(pick);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, batches, highlight, currentBatchId, onPick]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Pick batch — ${medicineName}`}
      description="↑↓ navigate · Enter swap · Esc close. Batches sorted FEFO (nearest expiry first)."
      maxWidth="xl"
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      {loading && <div className="py-8 text-center text-sm text-zinc-400">Loading batches…</div>}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!loading && !error && batches.length === 0 && (
        <div className="py-8 text-center text-sm text-zinc-400">No batches with stock.</div>
      )}
      {!loading && batches.length > 0 && (
        <ul className="max-h-96 divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-200">
          {batches.map((b, i) => {
            const isCurrent = b.batch_id === currentBatchId;
            const status = b.days_to_expiry < 0 ? 'expired'
              : b.days_to_expiry <= 30 ? 'critical'
              : b.days_to_expiry <= 90 ? 'warning' : 'ok';
            return (
              <li
                key={b.batch_id}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => { if (!isCurrent) onPick(b); }}
                className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition ${i === highlight ? 'bg-emerald-50' : 'hover:bg-zinc-50'} ${isCurrent ? 'cursor-default opacity-60' : ''}`}
              >
                <span className={`h-10 w-1.5 shrink-0 rounded-full ${
                  status === 'expired' ? 'bg-rose-500'
                  : status === 'critical' ? 'bg-orange-500'
                  : status === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-zinc-900">Batch: {b.batch_number}</span>
                    {isCurrent && <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">CURRENT</span>}
                    {status === 'critical' && <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">{b.days_to_expiry}d left</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-500">
                    <span>Expiry: <strong className="text-zinc-700">{fmt(b.expiry_date)}</strong></span>
                    <span>MRP: <strong className="text-zinc-700">₹{Number(b.mrp).toFixed(2)}</strong></span>
                    {b.selling_price != null && <span>Sell: <strong className="text-indigo-700">₹{Number(b.selling_price).toFixed(2)}</strong></span>}
                    {b.supplier_name && <span>Supplier: <strong className="text-zinc-700">{b.supplier_name}</strong></span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-lg font-extrabold ${b.current_quantity < 10 ? 'text-rose-600' : 'text-zinc-900'}`}>{b.current_quantity}</div>
                  <div className="text-[10px] font-bold uppercase text-zinc-400">in stock</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function fmt(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }); }
  catch { return iso; }
}
