'use client';

/**
 * Create Purchase Return — WEB_PARITY_PLAN §2.6.5.a.
 *
 * Search a purchase by bill number, pick how many units of each line to
 * return, and submit. Totals (subtotal/GST/total) are computed
 * proportionally from the original bill so discounts/rounding stay correct.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getPurchaseForReturn,
  rpcCommitPurchaseReturn,
  DomainError,
  type PurchaseForReturn,
  type PurchaseForReturnItem,
} from '@shelfcure/api-client';
import { useHotkey } from '@shelfcure/hotkeys';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Alert } from '../../../../components/form-fields';

interface Props {
  storeId: string;
  initialBill: string;
}

function fmtINR(n: number) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getUpp(item: PurchaseForReturnItem): number {
  return item.sale_unit_mode === 'both' && (item.units_per_pack ?? 1) > 1 ? item.units_per_pack : 1;
}
function getTotalReceived(item: PurchaseForReturnItem): number {
  return Math.floor((item.quantity + (item.free_quantity ?? 0)) / getUpp(item));
}
function getMaxReturnable(item: PurchaseForReturnItem): number {
  const upp = getUpp(item);
  const notYetReturned = getTotalReceived(item) - Math.floor((item.returned_quantity ?? 0) / upp);
  const currentInStock = Math.floor((item.batch_current_quantity ?? 0) / upp);
  return Math.max(0, Math.min(notYetReturned, currentInStock));
}
function getUnitRate(item: PurchaseForReturnItem): number {
  const tr = getTotalReceived(item);
  return tr > 0 ? item.amount / tr : 0;
}

export function ReturnClient({ storeId, initialBill }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const searchRef = useRef<HTMLInputElement>(null);

  const [billInput, setBillInput] = useState(initialBill);
  const [purchase, setPurchase] = useState<PurchaseForReturn['purchase'] | null>(null);
  const [items, setItems] = useState<PurchaseForReturnItem[]>([]);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedReturn, setSavedReturn] = useState<{ id: string; number: string } | null>(null);

  const search = useCallback(async (bill: string) => {
    const trimmed = bill.trim();
    if (!trimmed) return;
    setSearching(true);
    setSearchError(null);
    setSavedReturn(null);
    try {
      const result = await getPurchaseForReturn(supabase, storeId, trimmed);
      setPurchase(result.purchase);
      setItems(result.items);
      setReturnQty({});
    } catch (e) {
      setPurchase(null);
      setItems([]);
      const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Search failed';
      setSearchError(msg.includes('not_found') ? `No purchase found for bill "${trimmed}"` : msg);
    } finally {
      setSearching(false);
    }
  }, [supabase, storeId]);

  // Auto-run if `?bill=` was provided.
  useEffect(() => {
    if (initialBill.trim()) search(initialBill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalReceivedById = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.id, getTotalReceived(it));
    return m;
  }, [items]);

  const originalBaseTotal = useMemo(() => items.reduce((s, i) => s + Number(i.amount), 0), [items]);

  const returningBaseTotal = useMemo(() => {
    return items.reduce((s, item) => {
      const qty = returnQty[item.id] ?? 0;
      if (qty <= 0) return s;
      const tr = totalReceivedById.get(item.id) ?? 0;
      return s + (tr > 0 ? (Number(item.amount) / tr) * qty : 0);
    }, 0);
  }, [items, returnQty, totalReceivedById]);

  const ratio = originalBaseTotal > 0 ? returningBaseTotal / originalBaseTotal : 0;
  const subtotal = (purchase?.subtotal ?? 0) * ratio;
  const gstAmount = (purchase?.gst_amount ?? 0) * ratio;
  const totalAmount = (purchase?.total_amount ?? 0) * ratio;
  const itemsSelected = Object.values(returnQty).filter((q) => q > 0).length;

  function setQty(item: PurchaseForReturnItem, qty: number) {
    const max = getMaxReturnable(item);
    const clamped = Math.max(0, Math.min(max, Math.floor(qty) || 0));
    setReturnQty((prev) => ({ ...prev, [item.id]: clamped }));
  }

  function returnFullBill() {
    const next: Record<string, number> = {};
    for (const item of items) {
      const max = getMaxReturnable(item);
      if (max > 0) next[item.id] = max;
    }
    setReturnQty(next);
  }

  function clearAll() {
    setReturnQty({});
  }

  const onSubmit = useCallback(async () => {
    if (!purchase) return;
    setSaveError(null);
    const selected = items.filter((it) => (returnQty[it.id] ?? 0) > 0);
    if (selected.length === 0) { setSaveError('Select at least one item to return.'); return; }

    const ratioForAmount = purchase.subtotal > 0 ? purchase.total_amount / purchase.subtotal : 1;

    setSaving(true);
    try {
      const result = await rpcCommitPurchaseReturn(supabase, {
        client_uuid: globalThis.crypto.randomUUID(),
        store_id: storeId,
        purchase_id: purchase.id,
        supplier_id: purchase.supplier_id,
        subtotal,
        gst_amount: gstAmount,
        total_amount: totalAmount,
        reason: 'Standard Return',
        items: selected.map((item) => {
          const qty = returnQty[item.id]!;
          const upp = getUpp(item);
          const unitRate = getUnitRate(item);
          return {
            purchase_item_id: item.id,
            medicine_id: item.medicine_id,
            batch_id: item.batch_id ?? '',
            quantity: qty * upp,
            amount: unitRate * qty * ratioForAmount,
          };
        }),
      });
      setSavedReturn({ id: result.returnId, number: result.returnNumber });
      router.refresh();
    } catch (e) {
      const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to save return';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }, [purchase, items, returnQty, subtotal, gstAmount, totalAmount, storeId, supabase, router]);

  useHotkey('Ctrl+A', (e) => { e.preventDefault(); if (!saving && purchase) onSubmit(); }, [saving, purchase, onSubmit]);
  useHotkey('Ctrl+F', (e) => { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }, []);

  const fullyReturned = items.length > 0 && items.every((it) => getMaxReturnable(it) === 0 && getTotalReceived(it) > 0);
  const partiallyReturned = !fullyReturned && items.some((it) => (it.returned_quantity ?? 0) > 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Process purchase return</h1>
        <p className="mt-1 text-sm text-zinc-600">Search the supplier invoice, choose quantities to return.</p>
      </div>

      {/* Bill search */}
      <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <input
          ref={searchRef}
          type="text"
          value={billInput}
          onChange={(e) => setBillInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(billInput); }}
          placeholder="Purchase invoice number… (Ctrl+F)"
          className="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        />
        <Button onClick={() => search(billInput)} loading={searching} disabled={!billInput.trim()}>
          Search
        </Button>
      </div>

      {searchError && <Alert variant="error">{searchError}</Alert>}

      {savedReturn && (
        <Alert variant="success">
          ✓ Return {savedReturn.number} created. <a href={`/dashboard/purchases/returns/${savedReturn.id}`} className="font-semibold underline">View return →</a>
        </Alert>
      )}

      {purchase && (
        <>
          {/* Invoice header strip */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-indigo-50 p-4 ring-1 ring-indigo-200">
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-700">Invoice Found</div>
            {fullyReturned && (
              <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Fully Returned</span>
            )}
            {partiallyReturned && (
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Partially Returned</span>
            )}
            <div className="ml-auto flex items-center gap-4 text-sm">
              <span className="font-mono font-semibold text-zinc-900">Bill {purchase.bill_number}</span>
              <span className="text-zinc-700">{purchase.supplier_name}</span>
              <span className="font-mono font-semibold text-zinc-900">{fmtINR(purchase.total_amount)}</span>
              <span className="text-zinc-500">{items.length} item{items.length === 1 ? '' : 's'}</span>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Items list */}
            <div className="space-y-3 lg:col-span-2">
              {items.map((item) => {
                const upp = getUpp(item);
                const totalReceived = getTotalReceived(item);
                const maxReturnable = getMaxReturnable(item);
                const alreadyFullyReturned = maxReturnable === 0;
                const qty = returnQty[item.id] ?? 0;
                const unitRate = getUnitRate(item);
                const returnValue = qty * unitRate;
                const unitLabel = upp > 1 ? 'Strips' : 'Units';

                return (
                  <div key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-zinc-900">{item.medicine_name ?? 'Unknown medicine'}</div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          Batch: {item.batch_number ?? '—'} · Received: {item.quantity}
                          {item.free_quantity ? `+${item.free_quantity}` : ''} = {totalReceived} {unitLabel}
                        </div>
                        {(item.returned_quantity ?? 0) > 0 && (
                          <div className="mt-0.5 text-xs text-amber-600">
                            ({Math.floor((item.returned_quantity ?? 0) / upp)} already returned)
                          </div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-3 text-xs">
                          <span className="font-medium text-indigo-600">In Stock: {Math.floor((item.batch_current_quantity ?? 0) / upp)} {unitLabel.toLowerCase()}</span>
                          {item.sold_quantity > 0 && (
                            <span className="font-medium text-red-600">{Math.floor(item.sold_quantity / upp)} sold</span>
                          )}
                          <span className="font-medium text-slate-500">Max returnable: {maxReturnable}</span>
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          Original: {fmtINR(item.amount)} · {fmtINR(unitRate)}/{unitLabel.slice(0, -1).toLowerCase()}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setQty(item, qty - 1)}
                            disabled={alreadyFullyReturned || qty <= 0}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
                          >−</button>
                          <input
                            type="number"
                            min={0}
                            max={maxReturnable}
                            value={qty}
                            onChange={(e) => setQty(item, parseInt(e.target.value, 10) || 0)}
                            disabled={alreadyFullyReturned}
                            className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-sm font-mono focus:border-orange-500 focus:outline-none disabled:bg-zinc-50"
                          />
                          <button
                            type="button"
                            onClick={() => setQty(item, qty + 1)}
                            disabled={alreadyFullyReturned || qty >= maxReturnable}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
                          >+</button>
                        </div>
                        <div className="mt-1.5 font-mono text-sm font-semibold text-orange-700">
                          {fmtINR(returnValue)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-2">
                <Button variant="secondary" onClick={returnFullBill}>Return Full Bill</Button>
                <Button variant="ghost" onClick={clearAll}>Clear All</Button>
              </div>
            </div>

            {/* Summary sidebar */}
            <div className="lg:sticky lg:top-4 lg:self-start">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Return summary</div>
                <div className="mt-2 text-sm text-zinc-700">
                  Items selected: <span className="font-semibold">{itemsSelected} of {items.length}</span>
                </div>
                <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-sm">
                  <div className="flex justify-between text-zinc-600"><span>Subtotal</span><span className="font-mono">{fmtINR(subtotal)}</span></div>
                  <div className="flex justify-between text-zinc-600"><span>GST</span><span className="font-mono">{fmtINR(gstAmount)}</span></div>
                </div>
                <div className="mt-2 border-t border-zinc-100 pt-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-zinc-700">Total Return</span>
                    <span className="font-mono text-2xl font-semibold text-orange-700">{fmtINR(totalAmount)}</span>
                  </div>
                </div>
                {saveError && <div className="mt-2"><Alert variant="error">{saveError}</Alert></div>}
                <Button onClick={onSubmit} loading={saving} size="lg" className="mt-3 w-full" disabled={itemsSelected === 0}>
                  Process Return · Ctrl+A
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
