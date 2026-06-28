'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  checkAiScanQuota,
  posSearchMedicines,
  searchMasterMedicines,
  rpcCommitPurchase,
  checkDuplicateBill,
  getRecentPurchaseRates,
  createSupplier,
  DomainError,
  type AiScanQuota,
  type PurchaseLineItem,
  type Supplier,
  type PosSearchResult,
  type DosageForm,
  type MedicineCategory,
} from '@shelfcure/api-client';
import { isInterState, evaluateRateDrift, matchMedicineName, type RateDriftLevel } from '@shelfcure/core';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Alert } from '../../../../components/form-fields';
import { QuickAddMedicineModal, type QuickAddMedicineDefaults } from './quick-add-medicine-modal';

// ─── Scanned-bill shape, ported verbatim from the desktop app's
// src/lib/invoke.ts (lines ~2360-2401) ScannedBill/ScannedBillItem types. ───

interface ScannedBillItem {
  sn?: number;
  medicine_name: string;
  hsn_code: string | null;
  manufacturer_code: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  quantity: number;
  free_quantity: number | null;
  purchase_rate: number;
  mrp: number;
  gst_percentage: number | null;
  discount_percentage: number | null;
  amount: number;
  taxable_amount: number | null;
  cgst_amount: number | null;
  sgst_amount: number | null;
  igst_amount: number | null;
  net_amount: number | null;
}

interface ScannedBill {
  supplier_name: string | null;
  supplier_gstin: string | null;
  supplier_phone: string | null;
  supplier_address: string | null;
  supplier_city: string | null;
  supplier_state: string | null;
  bill_number: string | null;
  bill_date: string | null;
  payment_type: string | null;
  items: ScannedBillItem[];
  subtotal: number | null;
  bill_discount: number | null;
  bill_cgst: number | null;
  bill_sgst: number | null;
  bill_igst: number | null;
  bill_round_off: number | null;
  total_amount: number | null;
  gst_amount: number | null;
  total_items?: number;
}

interface ReviewLine {
  key: string;
  medicine_id: string;
  medicine_name: string;
  linked: boolean;
  scanned_name: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  free_quantity: number;
  purchase_rate: number;
  mrp: number;
  gst_percentage: number;
  discount_percentage: number;
  amount: number;
  net_amount: number | null;
  suggestion: QuickAddMedicineDefaults | null;
}

interface RateGuard {
  lastRate: number;
  level: RateDriftLevel;
  supplierName: string;
}

type PaymentStatus = 'paid' | 'pending' | 'partial';
type Step = 'upload' | 'scanning' | 'review';

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

function normalizeName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
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

const inputCls =
  'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

interface Props {
  storeId: string;
  storeName: string;
  storeCode: string;
  storeState: string | null;
  storeGstin: string | null;
  initialSuppliers: Supplier[];
  dosageForms: DosageForm[];
  categories: MedicineCategory[];
}

export function ScanClient({
  storeId,
  storeName,
  storeCode,
  storeState,
  storeGstin,
  initialSuppliers,
  dosageForms,
  categories,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [quota, setQuota] = useState<AiScanQuota | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    checkAiScanQuota(supabase, storeId).then(setQuota).catch(() => setQuota(null));
  }, [supabase, storeId]);

  // ── Review state ──
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [supplierId, setSupplierId] = useState('');
  const [supplierUnmatched, setSupplierUnmatched] = useState(false);
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(todayISO());
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [totalItemsReported, setTotalItemsReported] = useState<number | null>(null);
  const [documentWarning, setDocumentWarning] = useState<string | null>(null);
  const [documentWarningAck, setDocumentWarningAck] = useState(false);

  const [subtotal, setSubtotal] = useState(0);
  const [billDiscount, setBillDiscount] = useState(0);
  const [billCgst, setBillCgst] = useState(0);
  const [billSgst, setBillSgst] = useState(0);
  const [billIgst, setBillIgst] = useState(0);
  const [billRoundOff, setBillRoundOff] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedPurchaseId, setSavedPurchaseId] = useState<string | null>(null);
  const [savedBillNumber, setSavedBillNumber] = useState<string | null>(null);
  const [billDuplicate, setBillDuplicate] = useState(false);
  const [rateGuards, setRateGuards] = useState<Record<string, RateGuard>>({});

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupState, setNewSupState] = useState('');
  const [newSupGstin, setNewSupGstin] = useState('');
  const [newSupCity, setNewSupCity] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  const [searchKey, setSearchKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PosSearchResult[]>([]);
  const [highlight, setHighlight] = useState(0);

  const [quickAddForKey, setQuickAddForKey] = useState<string | null>(null);

  // ── Upload + scan ──

  async function onFileChosen(file: File) {
    setScanError(null);
    setFileName(file.name);
    if (file.size > 10 * 1024 * 1024) {
      setScanError('File is larger than 10MB.');
      setFileName(null);
      return;
    }

    setStep('scanning');
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      bytes.forEach((b) => (binary += String.fromCharCode(b)));
      const base64 = btoa(binary);

      const { data, error: fnError } = await supabase.functions.invoke('scan-purchase-bill', {
        body: { store_id: storeId, mime_type: file.type, image_base64: base64 },
      });

      if (fnError) {
        const ctx = (fnError as { context?: Response }).context;
        let serverMessage: string | undefined;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            serverMessage = body?.error;
          } catch {
            /* response body wasn't JSON */
          }
        }
        throw new Error(serverMessage || fnError.message || 'Scan failed');
      }
      if (data?.error === 'OUT_OF_SCAN_CREDITS') {
        throw new Error(
          `Out of AI scan credits this month (${data.used}/${data.limit ?? '∞'} used). Use manual entry instead, or contact your admin.`,
        );
      }
      if (data?.error) throw new Error(data.error);

      const scanned = data.scanned as ScannedBill;
      setDocumentWarning(typeof data.document_warning === 'string' ? data.document_warning : null);
      setDocumentWarningAck(false);
      await buildReviewFromScan(scanned);
      checkAiScanQuota(supabase, storeId).then(setQuota).catch(() => {});
      setStep('review');
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Scan failed');
      setStep('upload');
    }
  }

  async function buildReviewFromScan(scanned: ScannedBill) {
    // Supplier match: GSTIN first, then name.
    const gstin = scanned.supplier_gstin?.trim().toUpperCase();
    const name = scanned.supplier_name ? normalizeName(scanned.supplier_name) : '';
    let matchedSupplier =
      (gstin && suppliers.find((s) => s.gstin?.toUpperCase() === gstin)) ||
      (name && suppliers.find((s) => normalizeName(s.name) === name)) ||
      null;

    if (matchedSupplier) {
      setSupplierId(matchedSupplier.id);
      setSupplierUnmatched(false);
      setShowSupplierModal(false);
    } else {
      setSupplierId('');
      setSupplierUnmatched(true);
      setNewSupName(scanned.supplier_name ?? '');
      setNewSupPhone(scanned.supplier_phone ?? '');
      setNewSupGstin(scanned.supplier_gstin ?? '');
      setNewSupCity(scanned.supplier_city ?? '');
      setNewSupState(scanned.supplier_state ?? '');
      setShowSupplierModal(true);
    }

    setBillNumber(scanned.bill_number ?? '');
    setBillDate(scanned.bill_date ?? todayISO());
    const isPaidNow = (scanned.payment_type ?? '').toUpperCase() === 'CASH';
    setPaymentStatus(isPaidNow ? 'paid' : 'pending');
    setPaidAmount(isPaidNow ? scanned.total_amount ?? 0 : 0);

    setSubtotal(scanned.subtotal ?? 0);
    setBillDiscount(scanned.bill_discount ?? 0);
    setBillCgst(scanned.bill_cgst ?? 0);
    setBillSgst(scanned.bill_sgst ?? 0);
    setBillIgst(scanned.bill_igst ?? 0);
    setBillRoundOff(scanned.bill_round_off ?? 0);
    setTotalAmount(scanned.total_amount ?? 0);
    setTotalItemsReported(scanned.total_items ?? null);

    // Match every scanned item against this store's medicines; for unmatched
    // items, try the master catalog to harvest suggested fields for quick-add.
    const builtLines: ReviewLine[] = [];
    const guards: Record<string, RateGuard> = {};

    for (const item of scanned.items) {
      const key = newKey();
      let medicineId = '';
      let medicineName = item.medicine_name;
      let linked = false;
      let suggestion: QuickAddMedicineDefaults | null = null;

      try {
        const candidates = await posSearchMedicines(supabase, storeId, item.medicine_name, 10);
        const match = matchMedicineName(
          item.medicine_name,
          candidates.map((c) => ({ id: c.medicine_id, name: c.name })),
        );
        if (match) {
          medicineId = match.id;
          medicineName = match.name;
          linked = true;

          try {
            const rates = await getRecentPurchaseRates(supabase, storeId, match.id, 3);
            if (rates.length > 0) {
              guards[key] = {
                lastRate: rates[0]!.rate,
                level: evaluateRateDrift(item.purchase_rate, rates[0]!.rate),
                supplierName: rates[0]!.supplier_name,
              };
            }
          } catch {
            /* non-fatal */
          }
        }
      } catch {
        /* non-fatal — leave unlinked */
      }

      if (!linked) {
        try {
          const masterCandidates = await searchMasterMedicines(supabase, { query: item.medicine_name, limit: 5 });
          const masterMatch = matchMedicineName(
            item.medicine_name,
            masterCandidates.map((m) => ({ id: m.id, name: m.name })),
          );
          if (masterMatch) {
            const m = masterCandidates.find((c) => c.id === masterMatch.id)!;
            suggestion = {
              name: item.medicine_name,
              salt_composition: m.salt_composition,
              manufacturer: m.manufacturer,
              strength: m.strength,
              dosage_form_name: m.dosage_form,
              pack_unit: m.pack_unit,
              pack_size: m.pack_size,
              hsn_code: item.hsn_code ?? m.hsn_code,
              default_gst_rate: item.gst_percentage ?? m.default_gst_rate,
              category_name: m.category,
            };
          }
        } catch {
          /* non-fatal */
        }
        if (!suggestion) {
          suggestion = {
            name: item.medicine_name,
            hsn_code: item.hsn_code,
            default_gst_rate: item.gst_percentage,
          };
        }
      }

      builtLines.push({
        key,
        medicine_id: medicineId,
        medicine_name: medicineName,
        linked,
        scanned_name: item.medicine_name,
        batch_number: item.batch_number ?? '',
        expiry_date: item.expiry_date ?? defaultExpiry(),
        quantity: item.quantity,
        free_quantity: item.free_quantity ?? 0,
        purchase_rate: item.purchase_rate,
        mrp: item.mrp,
        gst_percentage: item.gst_percentage ?? 12,
        discount_percentage: item.discount_percentage ?? 0,
        amount: item.amount,
        net_amount: item.net_amount,
        suggestion,
      });
    }

    setLines(builtLines);
    setRateGuards(guards);
  }

  // ── Derived ──

  const selectedSupplier = useMemo(() => suppliers.find((s) => s.id === supplierId) ?? null, [suppliers, supplierId]);
  const gstType = useMemo(
    () =>
      isInterState(selectedSupplier?.state ?? null, storeState ?? null, selectedSupplier?.gstin ?? null, storeGstin ?? null)
        ? ('igst' as const)
        : ('cgst_sgst' as const),
    [selectedSupplier, storeState, storeGstin],
  );

  const unlinkedCount = lines.filter((l) => !l.linked).length;
  const itemsSum = useMemo(() => lines.reduce((sum, l) => sum + l.amount, 0), [lines]);

  // ── Duplicate bill detection ──
  useEffect(() => {
    if (step !== 'review' || !billNumber.trim() || !supplierId) {
      setBillDuplicate(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const isDup = await checkDuplicateBill(supabase, storeId, supplierId, billNumber.trim());
        setBillDuplicate(isDup);
      } catch {
        setBillDuplicate(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [step, billNumber, supplierId, storeId, supabase]);

  // ── Medicine search debounce (manual link) ──
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
      } catch {
        /* non-fatal */
      }
    }, 180);
    return () => clearTimeout(t);
  }, [searchKey, searchQuery, storeId, supabase]);

  function updateLine(key: string, patch: Partial<ReviewLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setRateGuards((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function pickMedicineForLine(line: ReviewLine, r: PosSearchResult) {
    updateLine(line.key, { medicine_id: r.medicine_id, medicine_name: r.name, linked: true });
    setSearchKey(null);
    setSearchQuery('');
    setSearchResults([]);
    try {
      const rates = await getRecentPurchaseRates(supabase, storeId, r.medicine_id, 3);
      if (rates.length > 0) {
        setRateGuards((prev) => ({
          ...prev,
          [line.key]: {
            lastRate: rates[0]!.rate,
            level: evaluateRateDrift(line.purchase_rate, rates[0]!.rate),
            supplierName: rates[0]!.supplier_name,
          },
        }));
      }
    } catch {
      /* non-fatal */
    }
  }

  async function handleSaveSupplier() {
    if (!newSupName.trim()) {
      setSupplierError('Name is required');
      return;
    }
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
      setSupplierUnmatched(false);
      setShowSupplierModal(false);
    } catch (e) {
      setSupplierError(e instanceof Error ? e.message : 'Failed to create supplier');
    } finally {
      setSavingSupplier(false);
    }
  }

  function reset() {
    setStep('upload');
    setFileName(null);
    setScanError(null);
    setLines([]);
    setBillNumber('');
    setError(null);
    setSupplierId('');
    setSupplierUnmatched(false);
    setShowSupplierModal(false);
    setBillDuplicate(false);
    setRateGuards({});
    setQuickAddForKey(null);
    setDocumentWarning(null);
    setDocumentWarningAck(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function onSave() {
    setError(null);
    if (documentWarning && !documentWarningAck) {
      setError('Confirm this is really a purchase bill before saving (see the warning above).');
      return;
    }
    if (!supplierId) {
      setError('Pick or add a supplier first.');
      return;
    }
    if (!billNumber.trim()) {
      setError('Enter the supplier bill number.');
      return;
    }
    if (billDuplicate) {
      setError(`Bill "${billNumber.trim()}" already exists for this supplier.`);
      return;
    }
    if (lines.length === 0) {
      setError('No line items to save.');
      return;
    }
    for (const [i, l] of lines.entries()) {
      if (!l.medicine_id) {
        setError(`Line ${i + 1} ("${l.scanned_name}"): link or add this medicine before saving.`);
        return;
      }
      if (!l.batch_number.trim()) {
        setError(`Line ${i + 1} ("${l.medicine_name}"): enter a batch number — the bill didn't have a readable one.`);
        return;
      }
    }

    const blockLines = lines.filter((l) => rateGuards[l.key]?.level === 'block');
    if (blockLines.length > 0) {
      const names = blockLines.map((l) => l.medicine_name).join(', ');
      const ok = window.confirm(`Extreme rate change (≥50%) detected for: ${names}.\n\nAre you sure the rates are correct?`);
      if (!ok) return;
    }

    setSaving(true);
    try {
      const resolvedPaidAmount = paymentStatus === 'paid' ? totalAmount : paymentStatus === 'partial' ? paidAmount : 0;

      const items: PurchaseLineItem[] = lines.map((l) => ({
        medicine_id: l.medicine_id,
        batch_number: l.batch_number.trim(),
        expiry_date: l.expiry_date,
        quantity: l.quantity,
        free_quantity: l.free_quantity > 0 ? l.free_quantity : undefined,
        purchase_rate: l.purchase_rate,
        mrp: l.mrp,
        gst_percentage: l.gst_percentage,
        discount_percentage: l.discount_percentage > 0 ? l.discount_percentage : undefined,
        amount: l.net_amount ?? l.amount,
      }));

      const result = await rpcCommitPurchase(supabase, {
        client_uuid: globalThis.crypto.randomUUID(),
        store_id: storeId,
        supplier_id: supplierId,
        bill_number: billNumber.trim(),
        bill_date: billDate,
        bill_image_url: null,
        subtotal,
        discount_amount: billDiscount,
        cgst_amount: gstType === 'cgst_sgst' ? billCgst : 0,
        sgst_amount: gstType === 'cgst_sgst' ? billSgst : 0,
        igst_amount: gstType === 'igst' ? billIgst : 0,
        gst_amount: gstType === 'cgst_sgst' ? billCgst + billSgst : billIgst,
        total_amount: totalAmount,
        payment_status: paymentStatus,
        paid_amount: resolvedPaidAmount,
        payment_method: paymentMethod,
        is_ai_scanned: true,
        items,
      });

      setSavedPurchaseId(result.purchaseId);
      setSavedBillNumber(result.billNumber);
      router.refresh();
    } catch (e) {
      const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to save purchase';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  // ── Success screen ──
  if (savedPurchaseId && savedBillNumber) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-emerald-600">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-zinc-900">Purchase Saved!</h2>
        <p className="text-sm text-zinc-600">
          Bill <span className="font-mono font-semibold text-indigo-700">{savedBillNumber}</span> has been recorded and
          stock added to batches.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Link
            href={`/dashboard/purchases/${savedPurchaseId}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            View Bill
          </Link>
          <button
            onClick={() => {
              setSavedPurchaseId(null);
              setSavedBillNumber(null);
              reset();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Scan Another Bill
          </button>
          <Link href="/dashboard/purchases" className="text-sm text-zinc-500 hover:text-zinc-700">
            ← Back to Purchases
          </Link>
        </div>
      </div>
    );
  }

  // ── Upload / scanning step ──
  if (step !== 'review') {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-emerald-700">AI Scan Purchase Bill</div>
          <div className="mt-0.5 text-sm font-semibold text-zinc-900">
            {storeName} <span className="font-mono text-xs text-zinc-500">· {storeCode}</span>
          </div>
        </div>

        {quota && quota.limit != null && (
          <p className="text-center text-xs text-zinc-500">
            {quota.remaining} of {quota.limit} AI scans remaining this month
          </p>
        )}

        <div className="rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-10 text-center">
          {step === 'scanning' ? (
            <>
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
              <p className="mt-4 text-sm font-medium text-zinc-700">Reading {fileName}…</p>
              <p className="mt-1 text-xs text-zinc-500">Gemini is extracting supplier, items, and totals.</p>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" className="mx-auto h-10 w-10 text-zinc-400">
                <path
                  d="M5 3h2M3 5v2M5 21h2M3 19v-2M19 3h-2M21 5v2M19 21h-2M21 19v-2M9 7h6M9 12h6M9 17h6"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
              <p className="mt-3 text-sm font-medium text-zinc-700">Upload a photo or PDF of the supplier&apos;s bill</p>
              <p className="mt-1 text-xs text-zinc-500">JPG, PNG, or PDF · up to 10MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFileChosen(file);
                }}
                className="mx-auto mt-4 block w-full max-w-xs text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-700"
              />
            </>
          )}
        </div>

        {scanError && <Alert variant="error">{scanError}</Alert>}
        {quota && !quota.allowed && (
          <Alert variant="error">
            Out of AI scan credits this month ({quota.used}/{quota.limit}). Use{' '}
            <Link href="/dashboard/purchases/new" className="underline">
              manual entry
            </Link>{' '}
            instead.
          </Alert>
        )}

        <div className="text-center">
          <Link href="/dashboard/purchases" className="text-sm text-zinc-500 hover:text-zinc-700">
            ← Back to Purchases
          </Link>
        </div>
      </div>
    );
  }

  // ── Review step ──
  return (
    <div className="space-y-4">
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-bold text-zinc-900">
              {supplierUnmatched ? "Supplier not found — quick add" : 'Quick Add Supplier'}
            </h2>
            {supplierUnmatched && (
              <p className="mb-4 text-xs text-zinc-500">Pre-filled from the scanned bill. Review and save.</p>
            )}
            {supplierError && <p className="mb-3 text-sm text-red-600">{supplierError}</p>}
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-600">Name *</span>
                <input value={newSupName} onChange={(e) => setNewSupName(e.target.value)} autoFocus className={inputCls} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-zinc-600">Phone</span>
                  <input value={newSupPhone} onChange={(e) => setNewSupPhone(e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-zinc-600">City</span>
                  <input value={newSupCity} onChange={(e) => setNewSupCity(e.target.value)} className={inputCls} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-zinc-600">State</span>
                  <input value={newSupState} onChange={(e) => setNewSupState(e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-zinc-600">GSTIN</span>
                  <input
                    value={newSupGstin}
                    onChange={(e) => setNewSupGstin(e.target.value.toUpperCase())}
                    className={`${inputCls} uppercase`}
                  />
                </label>
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

      {quickAddForKey &&
        (() => {
          const line = lines.find((l) => l.key === quickAddForKey);
          if (!line) return null;
          return (
            <QuickAddMedicineModal
              storeId={storeId}
              defaults={line.suggestion ?? { name: line.scanned_name }}
              dosageForms={dosageForms}
              categories={categories}
              onClose={() => setQuickAddForKey(null)}
              onCreated={(med) => {
                updateLine(line.key, { medicine_id: med.id, medicine_name: med.name, linked: true });
                setQuickAddForKey(null);
              }}
            />
          );
        })()}

      <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-emerald-700">AI-scanned purchase · review</div>
          <div className="mt-0.5 text-sm font-semibold text-zinc-900">
            {storeName} <span className="font-mono text-xs text-zinc-500">· {storeCode}</span>
          </div>
        </div>
        <button onClick={reset} className="text-xs font-medium text-zinc-500 hover:text-zinc-800">
          Scan a different bill
        </button>
      </div>

      {documentWarning && (
        <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">⚠ This doesn&apos;t look like a purchase bill</p>
          <p className="mt-1 text-sm text-red-700">{documentWarning}</p>
          <p className="mt-1 text-xs text-red-600">
            Saving this as a purchase would add stock for items that may not have actually been received — double-check
            the original document before continuing.
          </p>
          <label className="mt-3 flex items-center gap-2 text-xs font-medium text-red-800">
            <input
              type="checkbox"
              checked={documentWarningAck}
              onChange={(e) => setDocumentWarningAck(e.target.checked)}
              className="h-4 w-4 rounded border-red-400 text-red-600 focus:ring-red-500"
            />
            I&apos;ve checked the original document and this is correct — let me save it anyway.
          </label>
        </div>
      )}

      {totalItemsReported != null && lines.length < totalItemsReported && (
        <Alert variant="info">
          The bill appears to have {totalItemsReported} items but only {lines.length} were extracted — check the
          original bill for a missed row.
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
                onClick={() => {
                  setNewSupName('');
                  setNewSupPhone('');
                  setNewSupGstin('');
                  setNewSupCity('');
                  setNewSupState('');
                  setShowSupplierModal(true);
                }}
                className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-800"
              >
                + Quick add
              </button>
            </div>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
              <option value="">— Select supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.city ? ` · ${s.city}` : ''}
                </option>
              ))}
            </select>
            {gstType === 'igst' && <p className="mt-1 text-[10px] font-semibold text-blue-600">⚡ Inter-state · IGST applies</p>}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-600">Supplier bill #</span>
            <input type="text" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-600">Bill date</span>
            <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className={inputCls} />
          </label>
        </div>

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
          <table className="w-full min-w-[1320px] text-sm">
            <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="min-w-[220px] px-3 py-2.5">Medicine</th>
                <th className="w-36 px-3 py-2.5">Batch #</th>
                <th className="w-40 px-3 py-2.5">Expiry</th>
                <th className="w-20 px-3 py-2.5 text-center">Qty</th>
                <th className="w-20 px-3 py-2.5 text-center">Free</th>
                <th className="w-28 px-3 py-2.5 text-right">Rate</th>
                <th className="w-28 px-3 py-2.5 text-right">MRP</th>
                <th className="w-20 px-3 py-2.5 text-right">GST%</th>
                <th className="w-20 px-3 py-2.5 text-right">Disc%</th>
                <th className="w-32 px-3 py-2.5 text-right">Amount</th>
                <th className="w-10 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {lines.map((l) => {
                const showResults = searchKey === l.key && searchResults.length > 0;
                const guard = rateGuards[l.key];
                return (
                  <tr key={l.key} className={`align-top hover:bg-zinc-50/40 ${!l.linked ? 'bg-amber-50/40' : ''}`}>
                    <td className="relative px-3 py-2">
                      {l.linked ? (
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="min-w-0 truncate font-medium text-zinc-900">{l.medicine_name}</span>
                            <button
                              type="button"
                              onClick={() => updateLine(l.key, { medicine_id: '', linked: false })}
                              className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700"
                            >
                              change
                            </button>
                          </div>
                          {guard && guard.level !== 'ok' && (
                            <p className={`text-[10px] font-semibold ${DRIFT_COLOR[guard.level]}`}>
                              ⚠ {DRIFT_LABEL[guard.level]} vs ₹{guard.lastRate.toFixed(2)} ({guard.supplierName})
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-amber-700">{l.scanned_name}</div>
                          <input
                            type="text"
                            placeholder="Search medicine…"
                            value={searchKey === l.key ? searchQuery : ''}
                            onFocus={() => {
                              setSearchKey(l.key);
                              setSearchQuery('');
                            }}
                            onChange={(e) => {
                              setSearchKey(l.key);
                              setSearchQuery(e.target.value);
                            }}
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
                                if (pick) pickMedicineForLine(l, pick);
                              } else if (e.key === 'Escape') setSearchKey(null);
                            }}
                            className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                          <button
                            type="button"
                            onClick={() => setQuickAddForKey(l.key)}
                            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                          >
                            + Add as new medicine
                          </button>
                        </div>
                      )}
                      {showResults && (
                        <ul className="absolute z-10 mt-1 max-h-72 w-80 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
                          {searchResults.map((r, idx) => (
                            <li
                              key={r.medicine_id}
                              onMouseEnter={() => setHighlight(idx)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                pickMedicineForLine(l, r);
                              }}
                              className={`cursor-pointer px-3 py-2 text-sm ${idx === highlight ? 'bg-emerald-50' : 'hover:bg-zinc-50'}`}
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
                        placeholder="required"
                        className={`w-full rounded-lg border bg-white px-2 py-1 text-sm uppercase focus:border-emerald-500 focus:outline-none ${
                          l.batch_number.trim() ? 'border-zinc-300' : 'border-amber-300'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={l.expiry_date}
                        onChange={(e) => updateLine(l.key, { expiry_date: e.target.value })}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) => updateLine(l.key, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={l.free_quantity}
                        onChange={(e) => updateLine(l.key, { free_quantity: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={l.purchase_rate}
                        onChange={(e) => {
                          const rate = parseFloat(e.target.value) || 0;
                          updateLine(l.key, { purchase_rate: rate });
                          const guard = rateGuards[l.key];
                          if (guard) setRateGuards((prev) => ({ ...prev, [l.key]: { ...guard, level: evaluateRateDrift(rate, guard.lastRate) } }));
                        }}
                        className={`w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm font-mono focus:border-emerald-500 focus:outline-none ${
                          guard && guard.level !== 'ok' ? 'border-amber-300 bg-amber-50' : ''
                        }`}
                      />
                    </td>
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
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={l.gst_percentage}
                        onChange={(e) => updateLine(l.key, { gst_percentage: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </td>
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
                    <td className="px-3 py-2 text-right font-mono font-medium text-zinc-900">
                      ₹{(l.net_amount ?? l.amount).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => removeLine(l.key)} className="text-zinc-400 hover:text-red-600" aria-label="Remove">
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/50 px-3 py-2.5 text-xs text-zinc-500">
          <span>
            {lines.length} {lines.length === 1 ? 'line' : 'lines'}
          </span>
          {unlinkedCount > 0 && <span className="font-semibold text-amber-700">{unlinkedCount} need linking</span>}
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {/* Bill summary — extracted values, editable, not recomputed */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Bill summary — as printed (editable)
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryField label="Subtotal" value={subtotal} onChange={setSubtotal} />
            <SummaryField label="Discount" value={billDiscount} onChange={setBillDiscount} />
            {gstType === 'cgst_sgst' ? (
              <>
                <SummaryField label="CGST" value={billCgst} onChange={setBillCgst} />
                <SummaryField label="SGST" value={billSgst} onChange={setBillSgst} />
              </>
            ) : (
              <SummaryField label="IGST" value={billIgst} onChange={setBillIgst} />
            )}
            <SummaryField label="Round-off" value={billRoundOff} onChange={setBillRoundOff} />
            <SummaryField label="Total" value={totalAmount} onChange={setTotalAmount} highlight />
          </div>
          {Math.abs(itemsSum - subtotal) > 1 && (
            <p className="mt-2 text-[11px] text-amber-700">
              Line items sum to ₹{itemsSum.toFixed(2)}, which differs from the extracted subtotal (₹{subtotal.toFixed(2)}) —
              worth checking the original bill for a missed row.
            </p>
          )}
          {paymentStatus === 'partial' && (
            <div className="mt-3 flex justify-between border-t border-zinc-100 pt-3 text-sm">
              <span className="text-zinc-500">Balance due:</span>
              <span className="font-mono font-semibold text-amber-700">₹{Math.max(0, totalAmount - paidAmount).toFixed(2)}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={reset}>
            Discard
          </Button>
          <Button onClick={onSave} loading={saving} size="lg">
            Save purchase
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryField({
  label,
  value,
  onChange,
  highlight = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  highlight?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={`w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 font-mono focus:border-emerald-500 focus:outline-none ${
          highlight ? 'text-lg font-semibold text-zinc-900' : 'text-sm text-zinc-700'
        }`}
      />
    </label>
  );
}
