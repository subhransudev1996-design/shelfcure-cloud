'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  posSearchMedicines,
  rpcCommitPurchase,
  markPurchaseOrderFulfilled,
  checkDuplicateBill,
  getRecentPurchaseRates,
  createSupplier,
  type PurchaseLineItem,
  type Supplier,
  type PosSearchResult,
  type PurchaseOrderDetail,
  DomainError,
} from '@shelfcure/api-client';
import { computeBill, isInterState, evaluateRateDrift, type RateDriftLevel, type BillLineInput } from '@shelfcure/core';
import { useHotkey } from '@shelfcure/hotkeys';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Alert } from '../../../../components/form-fields';

interface Props {
  storeId: string;
  storeName: string;
  storeCode: string;
  storeState: string | null;
  storeGstin: string | null;
  initialSuppliers: Supplier[];
  purchaseOrder?: PurchaseOrderDetail | null;
}

interface PurchaseLine {
  key: string;
  medicine_id: string;
  medicine_name: string;
  sale_unit_mode: 'pack_only' | 'both' | 'individual';
  units_per_pack: number;
  batch_number: string;
  expiry_date: string;
  quantity: number;       // strips (user-entered)
  free_quantity: number;  // strips (user-entered)
  purchase_rate: number;
  mrp: number;
  gst_percentage: number;
  discount_percentage: number;
}

interface RateGuard {
  lastRate: number;
  level: RateDriftLevel;
  supplierName: string;
}

type PaymentStatus = 'paid' | 'pending' | 'partial';

function newKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function defaultExpiry() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 2);
  return d.toISOString().slice(0, 10);
}

function blankLine(): PurchaseLine {
  return {
    key: newKey(),
    medicine_id: '',
    medicine_name: '',
    sale_unit_mode: 'pack_only',
    units_per_pack: 1,
    batch_number: '',
    expiry_date: defaultExpiry(),
    quantity: 1,
    free_quantity: 0,
    purchase_rate: 0,
    mrp: 0,
    gst_percentage: 12,
    discount_percentage: 0,
  };
}

const DRIFT_COLOR: Record<RateDriftLevel, string> = {
  ok: '',
  warn: 'text-amber-600',
  danger: 'text-orange-600',
  block: 'text-red-600',
};

const DRIFT_LABEL: Record<RateDriftLevel, string> = {
  ok: '',
  warn: 'Rate changed',
  danger: 'Large rate change',
  block: 'Extreme rate change!',
};

export function PurchaseClient({
  storeId,
  storeName,
  storeCode,
  storeState,
  storeGstin,
  initialSuppliers,
  purchaseOrder,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [supplierId, setSupplierId] = useState<string>(
    purchaseOrder?.order.supplier_id ?? initialSuppliers[0]?.id ?? '',
  );
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(todayISO());
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');

  const [lines, setLines] = useState<PurchaseLine[]>(() =>
    (purchaseOrder?.items ?? []).map((item) => ({
      ...blankLine(),
      key: newKey(),
      medicine_id: item.medicine_id,
      medicine_name: item.medicine_name,
      quantity: item.requested_quantity,
    })),
  );

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedPurchaseId, setSavedPurchaseId] = useState<string | null>(null);
  const [savedBillNumber, setSavedBillNumber] = useState<string | null>(null);
  const [billDuplicate, setBillDuplicate] = useState(false);

  // Per-line medicine search state
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PosSearchResult[]>([]);
  const [highlight, setHighlight] = useState(0);

  // Rate guards keyed by line key
  const [rateGuards, setRateGuards] = useState<Record<string, RateGuard>>({});

  // Quick Add Supplier modal
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupState, setNewSupState] = useState('');
  const [newSupGstin, setNewSupGstin] = useState('');
  const [newSupCity, setNewSupCity] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  // Medicine search debounce
  useEffect(() => {
    if (!searchKey) { setSearchResults([]); return; }
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); return; }
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

  // Duplicate bill detection — debounced
  useEffect(() => {
    if (!billNumber.trim() || !supplierId) { setBillDuplicate(false); return; }
    const t = setTimeout(async () => {
      try {
        const isDup = await checkDuplicateBill(supabase, storeId, supplierId, billNumber.trim());
        setBillDuplicate(isDup);
      } catch { setBillDuplicate(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [billNumber, supplierId, storeId, supabase]);

  // Compute GST type based on selected supplier
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );
  const gstType = useMemo(
    () =>
      isInterState(
        selectedSupplier?.state ?? null,
        storeState ?? null,
        selectedSupplier?.gstin ?? null,
        storeGstin ?? null,
      )
        ? 'igst' as const
        : 'cgst_sgst' as const,
    [selectedSupplier, storeState, storeGstin],
  );

  const addBlankLine = useCallback(() => {
    setLines((prev) => [...prev, blankLine()]);
  }, []);

  function updateLine(key: string, patch: Partial<PurchaseLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setRateGuards((prev) => { const next = { ...prev }; delete next[key]; return next; });
  }

  async function pickMedicine(line: PurchaseLine, r: PosSearchResult) {
    const upp = r.units_per_pack ?? 1;
    updateLine(line.key, {
      medicine_id: r.medicine_id,
      medicine_name: r.name,
      sale_unit_mode: r.sale_unit_mode,
      units_per_pack: upp,
      gst_percentage: Number(r.gst_percentage ?? r.default_gst_rate ?? 12),
      mrp: line.mrp || Number(r.mrp ?? 0),
      purchase_rate: line.purchase_rate || Number(r.purchase_rate ?? 0),
    });
    setSearchKey(null);
    setSearchQuery('');
    setSearchResults([]);

    // Fetch recent rates for rate-guard
    try {
      const rates = await getRecentPurchaseRates(supabase, storeId, r.medicine_id, 3);
      if (rates.length > 0) {
        const lastRate = rates[0]!.rate;
        const currentRate = line.purchase_rate || Number(r.purchase_rate ?? 0);
        setRateGuards((prev) => ({
          ...prev,
          [line.key]: {
            lastRate,
            level: evaluateRateDrift(currentRate, lastRate),
            supplierName: rates[0]!.supplier_name,
          },
        }));
      }
    } catch { /* non-fatal */ }
  }

  // Re-evaluate rate guard when rate changes
  function handleRateChange(key: string, rate: number) {
    updateLine(key, { purchase_rate: rate });
    const guard = rateGuards[key];
    if (guard) {
      setRateGuards((prev) => ({
        ...prev,
        [key]: { ...guard, level: evaluateRateDrift(rate, guard.lastRate) },
      }));
    }
  }

  // Bill math — purchase_rate used as the "mrp" (cost price) for GST extraction
  const billLines: BillLineInput[] = useMemo(
    () =>
      lines.map((l) => ({
        mrp: l.purchase_rate,
        quantity: l.quantity,
        gstPercentage: l.gst_percentage,
        discountPercentage: l.discount_percentage > 0 ? l.discount_percentage : undefined,
      })),
    [lines],
  );

  const summary = useMemo(
    () => computeBill({ lines: billLines, gstType, roundOff: true }),
    [billLines, gstType],
  );

  function clearForm() {
    setLines([]);
    setBillNumber('');
    setBillDate(todayISO());
    setPaymentStatus('pending');
    setPaidAmount(0);
    setError(null);
    setSavedPurchaseId(null);
    setSavedBillNumber(null);
    setRateGuards({});
  }

  async function handleSaveSupplier() {
    if (!newSupName.trim()) { setSupplierError('Name is required'); return; }
    setSavingSupplier(true);
    setSupplierError(null);
    try {
      const sup = await createSupplier(supabase, {
        name: newSupName.trim(),
        phone: newSupPhone.trim() || undefined,
        state: newSupState.trim() || undefined,
        gstin: newSupGstin.trim() || undefined,
        city: newSupCity.trim() || undefined,
        store_id: storeId,
      });
      setSuppliers((prev) => [...prev, sup]);
      setSupplierId(sup.id);
      setShowSupplierModal(false);
      setNewSupName(''); setNewSupPhone(''); setNewSupState(''); setNewSupGstin(''); setNewSupCity('');
    } catch (e) {
      setSupplierError(e instanceof Error ? e.message : 'Failed to create supplier');
    } finally {
      setSavingSupplier(false);
    }
  }

  async function onSave() {
    setError(null);
    if (!supplierId) { setError('Pick a supplier first.'); return; }
    if (!billNumber.trim()) { setError('Enter the supplier bill number.'); return; }
    if (billDuplicate) { setError(`Bill "${billNumber.trim()}" already exists for this supplier.`); return; }
    if (lines.length === 0) { setError('Add at least one line.'); return; }

    for (const [i, l] of lines.entries()) {
      if (!l.medicine_id) { setError(`Line ${i + 1}: pick a medicine.`); return; }
      if (!l.batch_number.trim()) { setError(`Line ${i + 1}: enter a batch number.`); return; }
      if (!l.expiry_date) { setError(`Line ${i + 1}: enter expiry date.`); return; }
      if (l.quantity <= 0) { setError(`Line ${i + 1}: quantity must be > 0.`); return; }
      if (l.mrp <= 0) { setError(`Line ${i + 1}: MRP must be > 0.`); return; }
    }

    // Rate-drift hard-confirm at ≥50%
    const blockLines = lines.filter((l) => rateGuards[l.key]?.level === 'block');
    if (blockLines.length > 0) {
      const names = blockLines.map((l) => l.medicine_name).join(', ');
      const ok = window.confirm(
        `Extreme rate change (≥50%) detected for: ${names}.\n\nAre you sure the rates are correct?`,
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const resolvedPaidAmount =
        paymentStatus === 'paid'
          ? summary.totalAmount
          : paymentStatus === 'partial'
          ? paidAmount
          : 0;

      const items: PurchaseLineItem[] = lines.map((l, i) => {
        const s = summary.lines[i]!;
        const isFlexible = l.sale_unit_mode === 'both' && l.units_per_pack > 1;
        const storedQty = isFlexible ? l.quantity * l.units_per_pack : l.quantity;
        const storedFree = isFlexible ? l.free_quantity * l.units_per_pack : l.free_quantity;
        return {
          medicine_id: l.medicine_id,
          batch_number: l.batch_number.trim(),
          expiry_date: l.expiry_date,
          quantity: storedQty,
          free_quantity: storedFree > 0 ? storedFree : undefined,
          purchase_rate: l.purchase_rate,
          mrp: l.mrp,
          gst_percentage: l.gst_percentage,
          discount_percentage: l.discount_percentage > 0 ? l.discount_percentage : undefined,
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
        payment_status: paymentStatus,
        paid_amount: resolvedPaidAmount,
        payment_method: paymentMethod,
        items,
      });

      if (purchaseOrder) {
        await markPurchaseOrderFulfilled(supabase, purchaseOrder.order.id, result.purchaseId);
      }

      setSavedPurchaseId(result.purchaseId);
      setSavedBillNumber(result.billNumber);
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
  }, [lines, saving, supplierId, billNumber, billDate, summary, paymentStatus, paidAmount]);

  useHotkey('+', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    e.preventDefault();
    addBlankLine();
  }, [addBlankLine]);

  // Success screen
  if (savedPurchaseId && savedBillNumber) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mx-auto">
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-emerald-600">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-zinc-900">Purchase Saved!</h2>
        <p className="text-sm text-zinc-600">
          Bill <span className="font-mono font-semibold text-indigo-700">{savedBillNumber}</span>{' '}
          has been recorded and stock added to batches.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Link
            href={`/dashboard/purchases/${savedPurchaseId}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            View Bill
          </Link>
          <button
            onClick={() => { setSavedPurchaseId(null); setSavedBillNumber(null); }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            New Purchase
          </button>
          <Link
            href="/dashboard/purchases"
            className="text-sm text-zinc-500 hover:text-zinc-700"
          >
            ← Back to Purchases
          </Link>
        </div>
      </div>
    );
  }

  if (suppliers.length === 0 && !showSupplierModal) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">Add a supplier first</h1>
        <p className="mt-2 text-sm text-zinc-600">
          You need at least one supplier before you can record a purchase bill.
        </p>
        <button
          onClick={() => setShowSupplierModal(true)}
          className="mt-6 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Add Supplier
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quick Add Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-bold text-zinc-900">Quick Add Supplier</h2>
            {supplierError && <p className="mb-3 text-sm text-red-600">{supplierError}</p>}
            <div className="space-y-3">
              <Field label="Name *">
                <input value={newSupName} onChange={(e) => setNewSupName(e.target.value)} placeholder="Supplier name" autoFocus className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <input value={newSupPhone} onChange={(e) => setNewSupPhone(e.target.value)} placeholder="10-digit" className={inputCls} />
                </Field>
                <Field label="City">
                  <input value={newSupCity} onChange={(e) => setNewSupCity(e.target.value)} placeholder="City" className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="State">
                  <input value={newSupState} onChange={(e) => setNewSupState(e.target.value)} placeholder="e.g. Maharashtra" className={inputCls} />
                </Field>
                <Field label="GSTIN">
                  <input value={newSupGstin} onChange={(e) => setNewSupGstin(e.target.value.toUpperCase())} placeholder="27XXXXX..." className={`${inputCls} uppercase`} />
                </Field>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowSupplierModal(false)}
                className="flex-1 rounded-xl border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSupplier}
                disabled={savingSupplier}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {savingSupplier ? 'Saving…' : 'Save Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header strip */}
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-emerald-700">New purchase</div>
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

      {billDuplicate && (
        <Alert variant="error">
          Bill &ldquo;{billNumber}&rdquo; already exists for this supplier — this appears to be a duplicate.
        </Alert>
      )}

      {/* Bill header */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-600">Supplier</label>
              <button
                type="button"
                onClick={() => setShowSupplierModal(true)}
                className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-800"
              >
                + Quick add
              </button>
            </div>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={inputCls}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.city ? ` · ${s.city}` : ''}
                </option>
              ))}
            </select>
            {gstType === 'igst' && (
              <p className="mt-1 text-[10px] font-semibold text-blue-600">⚡ Inter-state · IGST applies</p>
            )}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-600">Supplier bill #</span>
            <input
              type="text"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
              placeholder="e.g. SP/2026/01234"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-600">Bill date</span>
            <input
              type="date"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>

        {/* Payment status */}
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-zinc-600">Payment status:</span>
            <div className="flex gap-1">
              {(['pending', 'partial', 'paid'] as PaymentStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPaymentStatus(s)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                    paymentStatus === s
                      ? s === 'paid'
                        ? 'bg-emerald-600 text-white'
                        : s === 'partial'
                        ? 'bg-blue-600 text-white'
                        : 'bg-amber-600 text-white'
                      : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {paymentStatus === 'partial' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Paid now:</span>
                <div className="flex items-center rounded-lg border border-zinc-300 bg-white px-2">
                  <span className="text-sm text-zinc-500">₹</span>
                  <input
                    type="number"
                    min={0}
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                    className="w-24 bg-transparent py-1.5 pl-1 text-sm font-mono focus:outline-none"
                  />
                </div>
              </div>
            )}
            {paymentStatus !== 'pending' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Method:</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs focus:outline-none"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2.5">Medicine</th>
                <th className="w-28 px-3 py-2.5">Batch #</th>
                <th className="w-32 px-3 py-2.5">Expiry</th>
                <th className="w-20 px-3 py-2.5 text-center">Qty</th>
                <th className="w-16 px-3 py-2.5 text-center">Free</th>
                <th className="w-24 px-3 py-2.5 text-right">Rate</th>
                <th className="w-24 px-3 py-2.5 text-right">MRP</th>
                <th className="w-14 px-3 py-2.5 text-right">GST%</th>
                <th className="w-14 px-3 py-2.5 text-right">Disc%</th>
                <th className="w-24 px-3 py-2.5 text-right">Amount</th>
                <th className="w-8 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-12 text-center text-sm text-zinc-400">
                    No lines yet — click <span className="font-mono text-zinc-600">+ Add line</span> or press{' '}
                    <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 font-mono text-[10px]">+</kbd>.
                  </td>
                </tr>
              ) : (
                lines.map((l, i) => {
                  const lineAmount = summary.lines[i]?.amount ?? 0;
                  const showResults = searchKey === l.key && searchResults.length > 0;
                  const guard = rateGuards[l.key];
                  const isFlexible = l.sale_unit_mode === 'both' && l.units_per_pack > 1;
                  const qtyLabel = isFlexible ? `Strips (×${l.units_per_pack})` : undefined;
                  return (
                    <tr key={l.key} className="align-top hover:bg-zinc-50/40">
                      {/* Medicine */}
                      <td className="relative px-3 py-2">
                        {l.medicine_id ? (
                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="min-w-0 truncate font-medium text-zinc-900">{l.medicine_name}</span>
                              <button
                                type="button"
                                onClick={() => updateLine(l.key, { medicine_id: '', medicine_name: '', sale_unit_mode: 'pack_only', units_per_pack: 1 })}
                                className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700"
                              >
                                change
                              </button>
                            </div>
                            {isFlexible && (
                              <p className="text-[10px] text-indigo-600">Flexible · {l.units_per_pack} units/strip</p>
                            )}
                            {guard && guard.level !== 'ok' && (
                              <p className={`text-[10px] font-semibold ${DRIFT_COLOR[guard.level]}`}>
                                ⚠ {DRIFT_LABEL[guard.level]} vs ₹{guard.lastRate.toFixed(2)} ({guard.supplierName})
                              </p>
                            )}
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
                              if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % searchResults.length); }
                              else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + searchResults.length) % searchResults.length); }
                              else if (e.key === 'Enter') { e.preventDefault(); const pick = searchResults[highlight]; if (pick) pickMedicine(l, pick); }
                              else if (e.key === 'Escape') setSearchKey(null);
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
                                className={`cursor-pointer px-3 py-2 text-sm ${idx === highlight ? 'bg-emerald-50' : 'hover:bg-zinc-50'}`}
                              >
                                <div className="truncate font-medium text-zinc-900">{r.name}</div>
                                <div className="truncate text-xs text-zinc-500">
                                  {r.manufacturer || '—'} · GST {r.default_gst_rate}%
                                  {r.sale_unit_mode === 'both' && r.units_per_pack && r.units_per_pack > 1
                                    ? ` · Flexible ${r.units_per_pack}/strip`
                                    : ''}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      {/* Batch */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={l.batch_number}
                          onChange={(e) => updateLine(l.key, { batch_number: e.target.value })}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm uppercase focus:border-emerald-500 focus:outline-none"
                        />
                      </td>
                      {/* Expiry */}
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={l.expiry_date}
                          onChange={(e) => updateLine(l.key, { expiry_date: e.target.value })}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      </td>
                      {/* Qty */}
                      <td className="px-3 py-2">
                        {qtyLabel && <p className="mb-0.5 text-[9px] text-indigo-500 text-center">{qtyLabel}</p>}
                        <input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) => updateLine(l.key, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      </td>
                      {/* Free qty */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={l.free_quantity}
                          onChange={(e) => updateLine(l.key, { free_quantity: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      </td>
                      {/* Rate */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={l.purchase_rate}
                          onChange={(e) => handleRateChange(l.key, parseFloat(e.target.value) || 0)}
                          className={`w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm font-mono focus:border-emerald-500 focus:outline-none ${
                            guard && guard.level !== 'ok' ? 'border-amber-300 bg-amber-50' : ''
                          }`}
                        />
                      </td>
                      {/* MRP */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={l.mrp}
                          onChange={(e) => updateLine(l.key, { mrp: parseFloat(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </td>
                      {/* GST% */}
                      <td className="px-3 py-2">
                        <select
                          value={l.gst_percentage}
                          onChange={(e) => updateLine(l.key, { gst_percentage: parseFloat(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-1 py-1 text-right text-xs focus:border-emerald-500 focus:outline-none"
                        >
                          {[0, 5, 12, 18, 28].map((r) => (
                            <option key={r} value={r}>{r}%</option>
                          ))}
                        </select>
                      </td>
                      {/* Disc% */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          max={100}
                          value={l.discount_percentage}
                          onChange={(e) => updateLine(l.key, { discount_percentage: parseFloat(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </td>
                      {/* Amount */}
                      <td className="px-3 py-2 text-right font-mono font-medium text-zinc-900">
                        ₹{lineAmount.toFixed(2)}
                      </td>
                      {/* Remove */}
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(l.key)}
                          className="text-zinc-400 hover:text-red-600"
                          aria-label="Remove"
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
        </div>
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
          <div className="text-xs text-zinc-500">{lines.length} {lines.length === 1 ? 'line' : 'lines'}</div>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {/* Footer totals + save */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <TotalsCol label="Subtotal" value={summary.subtotal} />
            {gstType === 'cgst_sgst' ? (
              <>
                <TotalsCol label={`CGST (${summary.cgstAmount > 0 ? '' : ''})`} value={summary.cgstAmount} />
                <TotalsCol label="SGST" value={summary.sgstAmount} />
              </>
            ) : (
              <TotalsCol label="IGST" value={summary.igstAmount} />
            )}
            {summary.roundOff !== 0 && <TotalsCol label="Round-off" value={summary.roundOff} />}
            <TotalsCol label="Total" value={summary.totalAmount} highlight />
          </div>
          {paymentStatus === 'partial' && (
            <div className="mt-3 border-t border-zinc-100 pt-3 flex justify-between text-sm">
              <span className="text-zinc-500">Balance due:</span>
              <span className="font-mono font-semibold text-amber-700">
                ₹{Math.max(0, summary.totalAmount - paidAmount).toFixed(2)}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={clearForm} disabled={lines.length === 0 && !billNumber}>
            Reset
          </Button>
          <Button onClick={onSave} loading={saving} size="lg" disabled={lines.length === 0}>
            Save · F9
          </Button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-600">{label}</span>
      {children}
    </label>
  );
}

function TotalsCol({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
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
      <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">{k}</kbd>
      <span>{children}</span>
    </span>
  );
}
