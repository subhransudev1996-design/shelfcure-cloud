'use client';

/**
 * Purchase entry — stock-in side of the POS.
 *
 * Flow:
 *   1. Pick supplier (or quick-add inline).
 *   2. Enter bill number + date.
 *   3. For each line: search/pick medicine, enter batch_number + expiry +
 *      quantity + purchase_rate + MRP. GST defaults from medicine.
 *   4. Totals computed live.
 *   5. Save → rpcCommitPurchase (idempotent via client_uuid).
 *
 * rpc_commit_purchase creates/tops-up batches automatically; we don't touch
 * the batches table directly from the client.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  posSearchMedicines,
  rpcCommitPurchase,
  markPurchaseOrderFulfilled,
  type PurchaseLineItem,
  type Supplier,
  type PosSearchResult,
  type PurchaseOrderDetail,
  DomainError,
} from '@shelfcure/api-client';
import { computeBill, type BillLineInput } from '@shelfcure/core';
import { useHotkey } from '@shelfcure/hotkeys';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Alert } from '../../../../components/form-fields';

interface Props {
  storeId: string;
  storeName: string;
  storeCode: string;
  initialSuppliers: Supplier[];
  purchaseOrder?: PurchaseOrderDetail | null;
}

interface PurchaseLine {
  key: string;
  medicine_id: string;
  medicine_name: string;
  batch_number: string;
  expiry_date: string; // YYYY-MM-DD
  quantity: number;
  purchase_rate: number;
  mrp: number;
  gst_percentage: number;
}

function newKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function defaultExpiry() {
  // 2 years out by default — typical pharma shelf life for new stock.
  const d = new Date();
  d.setFullYear(d.getFullYear() + 2);
  return d.toISOString().slice(0, 10);
}

export function PurchaseClient({ storeId, storeName, storeCode, initialSuppliers, purchaseOrder }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [suppliers] = useState<Supplier[]>(initialSuppliers);
  const [supplierId, setSupplierId] = useState<string>(
    purchaseOrder?.order.supplier_id ?? initialSuppliers[0]?.id ?? '',
  );
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(todayISO());

  const [lines, setLines] = useState<PurchaseLine[]>(() =>
    (purchaseOrder?.items ?? []).map((item) => ({
      key: newKey(),
      medicine_id: item.medicine_id,
      medicine_name: item.medicine_name,
      batch_number: '',
      expiry_date: defaultExpiry(),
      quantity: item.requested_quantity,
      purchase_rate: 0,
      mrp: 0,
      gst_percentage: 12,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Per-line medicine search state
  const [searchKey, setSearchKey] = useState<string | null>(null); // line key currently searching
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PosSearchResult[]>([]);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!searchKey) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const rows = await posSearchMedicines(supabase, storeId, q, 10);
        setSearchResults(rows);
        setHighlight(0);
      } catch (e) {
        console.error('[purchase] search failed', e);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [searchKey, searchQuery, storeId, supabase]);

  const addBlankLine = useCallback(() => {
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        medicine_id: '',
        medicine_name: '',
        batch_number: '',
        expiry_date: defaultExpiry(),
        quantity: 1,
        purchase_rate: 0,
        mrp: 0,
        gst_percentage: 12,
      },
    ]);
  }, []);

  function updateLine(key: string, patch: Partial<PurchaseLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function pickMedicine(line: PurchaseLine, r: PosSearchResult) {
    updateLine(line.key, {
      medicine_id: r.medicine_id,
      medicine_name: r.name,
      gst_percentage: Number(r.gst_percentage ?? r.default_gst_rate ?? 12),
      mrp: line.mrp || Number(r.mrp ?? 0),
      purchase_rate: line.purchase_rate || Number(r.mrp ?? 0) * 0.85,
    });
    setSearchKey(null);
    setSearchQuery('');
    setSearchResults([]);
  }

  // Bill math
  const billLines: BillLineInput[] = useMemo(
    () =>
      lines.map((l) => ({
        mrp: l.purchase_rate,
        quantity: l.quantity,
        gstPercentage: l.gst_percentage,
      })),
    [lines],
  );

  const summary = useMemo(
    () => computeBill({ lines: billLines, gstType: 'cgst_sgst', roundOff: true }),
    [billLines],
  );

  function clearForm() {
    setLines([]);
    setBillNumber('');
    setBillDate(todayISO());
    setError(null);
    setLastSaved(null);
  }

  async function onSave() {
    setError(null);
    if (!supplierId) { setError('Pick a supplier first.'); return; }
    if (!billNumber.trim()) { setError('Enter the supplier bill number.'); return; }
    if (lines.length === 0) { setError('Add at least one line.'); return; }

    for (const [i, l] of lines.entries()) {
      if (!l.medicine_id) { setError(`Line ${i + 1}: pick a medicine.`); return; }
      if (!l.batch_number.trim()) { setError(`Line ${i + 1}: enter a batch number.`); return; }
      if (!l.expiry_date) { setError(`Line ${i + 1}: enter expiry date.`); return; }
      if (l.quantity <= 0) { setError(`Line ${i + 1}: quantity must be > 0.`); return; }
      if (l.mrp <= 0) { setError(`Line ${i + 1}: MRP must be > 0.`); return; }
    }

    setSaving(true);
    try {
      const items: PurchaseLineItem[] = lines.map((l, i) => {
        const s = summary.lines[i]!;
        return {
          medicine_id: l.medicine_id,
          batch_number: l.batch_number.trim(),
          expiry_date: l.expiry_date,
          quantity: l.quantity,
          purchase_rate: l.purchase_rate,
          mrp: l.mrp,
          gst_percentage: l.gst_percentage,
          amount: s.amount,
        };
      });

      const result = await rpcCommitPurchase(supabase, {
        client_uuid: globalThis.crypto.randomUUID(),
        store_id: storeId,
        supplier_id: supplierId,
        bill_number: billNumber.trim(),
        bill_date: billDate,
        subtotal: summary.subtotal,
        taxable_amount: summary.taxableAmount,
        gst_amount: summary.gstAmount,
        cgst_amount: summary.cgstAmount,
        sgst_amount: summary.sgstAmount,
        igst_amount: summary.igstAmount,
        discount_amount: summary.discountAmount,
        total_amount: summary.totalAmount,
        payment_status: 'pending',
        items,
      });

      if (purchaseOrder) {
        await markPurchaseOrderFulfilled(supabase, purchaseOrder.order.id, result.purchaseId);
      }

      setLastSaved(result.billNumber);
      clearForm();
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to save purchase';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  useHotkey('F9', (e) => {
    e.preventDefault();
    if (!saving) onSave();
  }, [lines, saving, supplierId, billNumber, billDate, summary]);

  useHotkey('+', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    e.preventDefault();
    addBlankLine();
  }, [addBlankLine]);

  if (suppliers.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">Add a supplier first</h1>
        <p className="mt-2 text-sm text-zinc-600">
          You need at least one supplier before you can record a purchase bill.
        </p>
        <a
          href="/dashboard/suppliers"
          className="mt-6 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Go to Suppliers
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-emerald-700">
            New purchase
          </div>
          <div className="mt-0.5 text-sm font-semibold text-zinc-900">
            {storeName} <span className="font-mono text-xs text-zinc-500">· {storeCode}</span>
          </div>
        </div>
        <div className="hidden gap-4 text-xs text-zinc-600 sm:flex">
          <Hint k="+">Add line</Hint>
          <Hint k="F9">Save</Hint>
        </div>
      </div>

      {purchaseOrder && (
        <Alert variant="info">
          Converting reorder PO-{purchaseOrder.order.id.slice(0, 8).toUpperCase()} from{' '}
          {purchaseOrder.order.supplier_name} — fill in batch, expiry, rate &amp; MRP for each line, then save.
        </Alert>
      )}

      {lastSaved && (
        <Alert variant="success">
          ✓ Purchase {lastSaved} saved — stock has been added to batches.
        </Alert>
      )}

      {/* Bill header */}
      <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-600">Supplier</span>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.city ? ` · ${s.city}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-600">Supplier bill #</span>
          <input
            type="text"
            value={billNumber}
            onChange={(e) => setBillNumber(e.target.value)}
            placeholder="e.g. SP/2026/01234"
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-600">Bill date</span>
          <input
            type="date"
            value={billDate}
            onChange={(e) => setBillDate(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>
      </div>

      {/* Lines */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Medicine</th>
              <th className="w-32 px-3 py-2.5">Batch #</th>
              <th className="w-36 px-3 py-2.5">Expiry</th>
              <th className="w-20 px-3 py-2.5 text-center">Qty</th>
              <th className="w-24 px-3 py-2.5 text-right">Rate</th>
              <th className="w-24 px-3 py-2.5 text-right">MRP</th>
              <th className="w-16 px-3 py-2.5 text-right">GST%</th>
              <th className="w-24 px-3 py-2.5 text-right">Amount</th>
              <th className="w-10 px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-sm text-zinc-400">
                  No lines yet. Click <span className="font-mono text-zinc-600">+ Add line</span> or press <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 font-mono text-[10px]">+</kbd>.
                </td>
              </tr>
            ) : (
              lines.map((l, i) => {
                const lineAmount = summary.lines[i]?.amount ?? 0;
                const showResults = searchKey === l.key && searchResults.length > 0;
                return (
                  <tr key={l.key} className="align-top hover:bg-zinc-50/40">
                    <td className="relative px-3 py-2">
                      {l.medicine_id ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 truncate font-medium text-zinc-900">
                            {l.medicine_name}
                          </div>
                          <button
                            type="button"
                            onClick={() => updateLine(l.key, { medicine_id: '', medicine_name: '' })}
                            className="text-xs text-zinc-400 hover:text-zinc-700"
                          >
                            change
                          </button>
                        </div>
                      ) : (
                        <input
                          type="text"
                          autoFocus
                          placeholder="Search medicine…"
                          value={searchKey === l.key ? searchQuery : ''}
                          onFocus={() => { setSearchKey(l.key); setSearchQuery(''); }}
                          onChange={(e) => { setSearchKey(l.key); setSearchQuery(e.target.value); }}
                          onKeyDown={(e) => {
                            if (!showResults) return;
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setHighlight((h) => (h + 1) % searchResults.length);
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setHighlight((h) => (h - 1 + searchResults.length) % searchResults.length);
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              const pick = searchResults[highlight];
                              if (pick) pickMedicine(l, pick);
                            } else if (e.key === 'Escape') {
                              setSearchKey(null);
                            }
                          }}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      )}
                      {showResults && (
                        <ul className="absolute z-10 mt-1 max-h-72 w-80 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
                          {searchResults.map((r, idx) => (
                            <li
                              key={r.medicine_id}
                              onMouseEnter={() => setHighlight(idx)}
                              onMouseDown={(e) => { e.preventDefault(); pickMedicine(l, r); }}
                              className={`cursor-pointer px-3 py-2 text-sm ${
                                idx === highlight ? 'bg-emerald-50' : 'hover:bg-zinc-50'
                              }`}
                            >
                              <div className="truncate font-medium text-zinc-900">{r.name}</div>
                              <div className="truncate text-xs text-zinc-500">
                                {r.manufacturer || '—'} · GST {r.default_gst_rate}%
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={l.batch_number}
                        onChange={(e) => updateLine(l.key, { batch_number: e.target.value })}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm uppercase focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={l.expiry_date}
                        onChange={(e) => updateLine(l.key, { expiry_date: e.target.value })}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) => updateLine(l.key, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={l.purchase_rate}
                        onChange={(e) => updateLine(l.key, { purchase_rate: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm font-mono focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={l.mrp}
                        onChange={(e) => updateLine(l.key, { mrp: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm font-mono focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={28}
                        value={l.gst_percentage}
                        onChange={(e) => updateLine(l.key, { gst_percentage: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm font-mono focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-zinc-900">
                      ₹{lineAmount.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeLine(l.key)}
                        className="text-zinc-400 hover:text-red-600"
                        aria-label="Remove line"
                      >
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/50 px-3 py-2.5">
          <button
            type="button"
            onClick={addBlankLine}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add line
          </button>
          <div className="text-xs text-zinc-500">
            {lines.length} {lines.length === 1 ? 'line' : 'lines'}
          </div>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {/* Footer totals + save */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <Totals label="Subtotal" value={summary.subtotal} />
            <Totals label="GST" value={summary.gstAmount} />
            <Totals label="Round-off" value={summary.roundOff} />
            <Totals label="Total" value={summary.totalAmount} highlight />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={clearForm} disabled={lines.length === 0 && !billNumber && !lastSaved}>
            Reset
          </Button>
          <Button onClick={onSave} loading={saving} size="lg" disabled={lines.length === 0}>
            Save purchase · F9
          </Button>
        </div>
      </div>
    </div>
  );
}

function Totals({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`font-mono ${highlight ? 'text-xl font-semibold text-zinc-900' : 'text-sm text-zinc-700'}`}>
        ₹{value.toFixed(2)}
      </div>
    </div>
  );
}

function Hint({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
        {k}
      </kbd>
      <span>{children}</span>
    </span>
  );
}
