'use client';

/**
 * POS — Phase A parity build (WEB_PARITY_PLAN §2.2).
 *
 * Surface vs the previous build:
 *   • Per-line discount (% or ₹) in cart rows
 *   • Bill-level special discount (% or ₹) with a printable label
 *   • Misc / Note charges panel (delivery, packing, etc — multiple lines)
 *   • Split payment (any combination of cash / upi / card / credit)
 *   • Customer types: b2c / b2b + optional GSTIN
 *   • Bill profit live readout (revenue − cost)
 *   • Hotkeys: F1 help · F2 new · F4 customer · F9 save · Ctrl+F search ·
 *     Ctrl+R customer · Ctrl+Enter save · Alt+→/← walk sections · Esc
 *   • Draft recovery via localStorage (resume banner on reload)
 *
 * Still missing (Phase B/C/D): batch picker modal, doctor + prescription,
 * type-the-qty prompt, cell-walker, quick-access bar, Alt+1-9 hotkey manager,
 * sale-complete + print templates, WhatsApp share.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  posSearchMedicines, posSearchCustomers, posNextBillNumber, rpcCommitSale,
  type PosSearchResult, type PosCustomerResult, type PosBatchOption,
  type SaleLineItem, type SalePayment, type Customer, DomainError,
} from '@shelfcure/api-client';
import { computeBill, type BillLineInput } from '@shelfcure/core';
import { useHotkey } from '@shelfcure/hotkeys';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Alert } from '../../../../components/form-fields';
import { BatchPickerModal } from './batch-picker-modal';
import { QuickAddCustomerModal } from './quick-add-customer-modal';
import { DoctorPrescriptionSection } from './doctor-prescription-section';
import {
  BrandComparisonModal, HotkeyManagerModal, QuickAccessStrip,
  useAltHotkeys, useWedgeScannerDetection,
} from './phase-c-features';
import { posAddHotkeyMedicine, posRecentBillItems } from '@shelfcure/api-client';
import { SaleCompleteModal } from './sale-complete-modal';

interface Props {
  storeId: string;
  storeName: string;
  storeCode: string;
  storeState: string;
  orgName: string;
  orgId: string;
}

type LineDiscountType = 'none' | 'percent' | 'flat';
type BillDiscountType = 'none' | 'percent' | 'flat';
type PayMethod = 'cash' | 'upi' | 'card' | 'credit';
type CustomerType = 'b2c' | 'b2b';

// Customer-profile special discount (read-only on POS, auto-loaded from
// the selected customer). Stacks AFTER the manual bill discount.
interface SpecialDiscount {
  type: 'percentage' | 'flat' | null;
  value: number;
  label: string | null;
}

interface CartLine {
  key: string;
  medicine_id: string;
  medicine_name: string;
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  mrp: number;
  gst_percentage: number;
  hsn_code: string | null;
  stock_available: number;
  purchase_rate: number;
  discount_type: LineDiscountType;
  discount_value: number;
}

interface MiscCharge {
  id: string;
  note: string;
  amount: number;
}

interface SplitLine {
  id: string;
  method: PayMethod;
  amount: number;
  reference?: string;
}

interface DraftSnapshot {
  v: 3;
  savedAt: number;
  lines: CartLine[];
  miscCharges: MiscCharge[];
  billDiscount: { type: BillDiscountType; value: number };
  payments: SplitLine[];
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerType: CustomerType;
  customerGstin: string;
  customerOutstanding: number;
  rx: { enabled: boolean; doctorId: string | null; doctorName: string; imagePath: string | null };
}

const DRAFT_KEY_PREFIX = 'shelfcure.pos.draft.v1';
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function PosClient({ storeId, storeName, storeCode, storeState, orgName, orgId }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const draftKey = `${DRAFT_KEY_PREFIX}.${storeId}`;

  // ── Search ────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PosSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // ── Cart + bill state ─────────────────────────────────────
  const [lines, setLines] = useState<CartLine[]>([]);
  const [miscCharges, setMiscCharges] = useState<MiscCharge[]>([]);
  // Manual bill-level discount (cashier-typed, applies to medicineSubtotal).
  const [billDiscount, setBillDiscount] = useState<{ type: BillDiscountType; value: number }>({
    type: 'none', value: 0,
  });
  // Customer-profile special discount — derived from the selected customer.
  // The cashier cannot edit this here; they edit it on the customer record.
  const [specialDiscount, setSpecialDiscount] = useState<SpecialDiscount>({
    type: null, value: 0, label: null,
  });
  const [payments, setPayments] = useState<SplitLine[]>([{ id: newKey(), method: 'cash', amount: 0 }]);

  // ── Customer ──────────────────────────────────────────────
  const [customer, setCustomer] = useState<PosCustomerResult | null>(null);
  const [customerType, setCustomerType] = useState<CustomerType>('b2c');
  const [customerGstin, setCustomerGstin] = useState('');
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<PosCustomerResult[]>([]);
  const customerInputRef = useRef<HTMLInputElement | null>(null);

  // ── Doctor / Prescription (Phase B) ───────────────────────
  const [rx, setRx] = useState<{ enabled: boolean; doctorId: string | null; doctorName: string; imagePath: string | null }>({
    enabled: false, doctorId: null, doctorName: '', imagePath: null,
  });

  // ── Phase B modals / selection ────────────────────────────
  const [batchPickerFor, setBatchPickerFor] = useState<CartLine | null>(null);
  const [quickAddCustomerOpen, setQuickAddCustomerOpen] = useState(false);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number>(-1);
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Phase C state ────────────────────────────────────────
  const [hotkeyManagerOpen, setHotkeyManagerOpen] = useState(false);
  const [brandCompareFor, setBrandCompareFor] = useState<CartLine | null>(null);
  const [quickAccessSignal, setQuickAccessSignal] = useState(0); // bump → refetch
  // Right-click on a Quick Access tile pins it to a hotkey GROUP (server-backed).
  // We pop a small picker showing the 9 digits + their current group names so
  // the user knows which "Fever Pack" / "Cold Pack" they're adding to.
  const [pinPickerFor, setPinPickerFor] = useState<{ medicineId: string; name: string } | null>(null);
  const [reorderLoading, setReorderLoading] = useState(false);
  const [isScanning, registerKeystroke] = useWedgeScannerDetection();

  // ── Misc UI ───────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBill, setLastBill] = useState<{ number: string; id: string } | null>(null);
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resumeAvailable, setResumeAvailable] = useState<DraftSnapshot | null>(null);
  const [didCheckDraft, setDidCheckDraft] = useState(false);

  // ── Draft recovery ────────────────────────────────────────
  useEffect(() => {
    if (didCheckDraft || typeof window === 'undefined') return;
    setDidCheckDraft(true);
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const snap = JSON.parse(raw) as DraftSnapshot;
      if (snap.v >= 1 && (snap.lines.length > 0 || snap.miscCharges.length > 0)) {
        setResumeAvailable(snap);
      }
    } catch {}
  }, [draftKey, didCheckDraft]);

  // Persist on every meaningful change (debounced via the natural render cycle).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (lines.length === 0 && miscCharges.length === 0 && billDiscount.value === 0 && !customer && !rx.enabled) {
      try { localStorage.removeItem(draftKey); } catch {}
      return;
    }
    const snap: DraftSnapshot = {
      v: 3, savedAt: Date.now(),
      lines, miscCharges, billDiscount, payments,
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      customerType, customerGstin,
      customerOutstanding: customer?.outstanding ?? 0,
      rx,
    };
    try { localStorage.setItem(draftKey, JSON.stringify(snap)); } catch {}
  }, [draftKey, lines, miscCharges, billDiscount, payments, customer, customerType, customerGstin, rx]);

  function resumeDraft() {
    if (!resumeAvailable) return;
    setLines(resumeAvailable.lines);
    setMiscCharges(resumeAvailable.miscCharges);
    setBillDiscount(resumeAvailable.billDiscount ?? { type: 'none', value: 0 });
    const restoredPayments = resumeAvailable.payments.length
      ? resumeAvailable.payments
      : [{ id: newKey(), method: 'cash' as PayMethod, amount: 0 }];
    setPayments(restoredPayments);
    // Respect whatever the cashier had set on the draft — don't auto-overwrite.
    setPaymentsTouched(restoredPayments.length > 1 || restoredPayments[0]!.amount > 0);
    setCustomerType(resumeAvailable.customerType);
    setCustomerGstin(resumeAvailable.customerGstin);
    if (resumeAvailable.rx) setRx(resumeAvailable.rx);
    setResumeAvailable(null);
  }
  function discardDraft() {
    try { localStorage.removeItem(draftKey); } catch {}
    setResumeAvailable(null);
  }

  // ── Debounced searches ───────────────────────────────────
  useEffect(() => {
    if (!customerSearchOpen) return;
    const q = customerQuery.trim();
    if (!q) { setCustomerResults([]); return; }
    const t = setTimeout(async () => {
      try { setCustomerResults(await posSearchCustomers(supabase, storeId, q, 8)); }
      catch (e) { console.error('[pos] customer search failed', e); }
    }, 180);
    return () => clearTimeout(t);
  }, [customerQuery, customerSearchOpen, storeId, supabase]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setShowResults(false); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const rows = await posSearchMedicines(supabase, storeId, q, 12);
        setResults(rows); setShowResults(true); setHighlight(0);
      } catch (e) { console.error('[pos] search failed', e); }
      finally { setSearching(false); }
    }, 180);
    return () => clearTimeout(t);
  }, [query, storeId, supabase]);

  // ── Cart ops ──────────────────────────────────────────────
  // Add a medicine by ID — used by Alt+1-9 hotkey groups + Reorder Last Bill.
  // qty default 1; hotkey groups can request more per medicine.
  const addByMedicineId = useCallback(async (medicineId: string, qty = 1) => {
    try {
      const { data, error } = await supabase
        .from('medicines')
        .select('id, name')
        .eq('id', medicineId)
        .single();
      if (error || !data) throw new Error('Medicine not found');
      const list = await posSearchMedicines(supabase, storeId, data.name, 5);
      const hit = list.find((r) => r.medicine_id === medicineId) ?? list[0];
      if (!hit) { setError(`No stock for ${data.name}.`); return; }
      const add = addLineRef.current;
      if (!add) return;
      for (let i = 0; i < Math.max(1, qty); i++) add(hit);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add medicine');
    }
  }, [supabase, storeId]);

  // Forward-ref so the addByMedicineId closure can call the latest addLine.
  const addLineRef = useRef<((r: PosSearchResult) => void) | null>(null);

  const addLine = useCallback((r: PosSearchResult) => {
    if (!r.batch_id) { setError(`No stock available for ${r.name}.`); return; }
    setError(null);
    setLines((prev) => {
      const i = prev.findIndex((l) => l.batch_id === r.batch_id);
      if (i >= 0) {
        const cur = prev[i]!;
        if (cur.quantity + 1 > cur.stock_available) {
          setError(`Only ${cur.stock_available} units of ${cur.medicine_name} in this batch.`);
          return prev;
        }
        const next = [...prev]; next[i] = { ...cur, quantity: cur.quantity + 1 }; return next;
      }
      return [...prev, {
        key: newKey(),
        medicine_id: r.medicine_id, medicine_name: r.name,
        batch_id: r.batch_id!, batch_number: r.batch_number ?? '', expiry_date: r.expiry_date ?? '',
        quantity: 1,
        mrp: Number(r.selling_price ?? r.mrp ?? 0),
        gst_percentage: Number(r.gst_percentage ?? 0),
        hsn_code: r.hsn_code,
        stock_available: r.current_quantity,
        purchase_rate: Number(r.purchase_rate ?? 0),
        discount_type: 'none', discount_value: 0,
      }];
    });
    setQuery(''); setResults([]); setShowResults(false);
    searchInputRef.current?.focus();
  }, []);
  addLineRef.current = addLine;

  // Alt+1-9 hotkey GROUPS (server-backed; bulk-add every medicine in the group).
  const { groups: hotkeyGroups, refetch: refetchHotkeys } = useAltHotkeys(storeId, addByMedicineId);

  // Reorder Last Bill — pulls last bill items for the picked customer.
  async function onReorderLastBill() {
    if (!customer) return;
    setReorderLoading(true);
    try {
      const rows = await posRecentBillItems(supabase, storeId, customer.id);
      let added = 0;
      for (const r of rows) {
        if (r.batch_id) { addLine(r); added++; }
      }
      if (added === 0) setError('Last bill\'s medicines have no stock right now.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reorder');
    } finally { setReorderLoading(false); }
  }

  const updateLine = (key: string, patch: Partial<CartLine>) => setLines((prev) =>
    prev.map((l) => l.key === key ? { ...l, ...patch } : l));
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  function addMisc() {
    setMiscCharges((m) => [...m, { id: newKey(), note: '', amount: 0 }]);
  }
  function updateMisc(id: string, patch: Partial<MiscCharge>) {
    setMiscCharges((m) => m.map((c) => c.id === id ? { ...c, ...patch } : c));
  }
  function removeMisc(id: string) {
    setMiscCharges((m) => m.filter((c) => c.id !== id));
  }

  function addPayment() {
    // Splitting → cashier is now in manual mode; auto-balance is off.
    setPaymentsTouched(true);
    setPayments((p) => [...p, { id: newKey(), method: 'cash', amount: 0 }]);
  }
  function updatePayment(id: string, patch: Partial<SplitLine>) {
    // Any manual edit (amount, method, reference) takes over from auto-balance.
    setPaymentsTouched(true);
    setPayments((p) => p.map((x) => x.id === id ? { ...x, ...patch } : x));
  }
  function removePayment(id: string) {
    setPayments((p) => (p.length <= 1 ? p : p.filter((x) => x.id !== id)));
  }

  const clearAll = useCallback(() => {
    setLines([]); setMiscCharges([]);
    setBillDiscount({ type: 'none', value: 0 });
    setSpecialDiscount({ type: null, value: 0, label: null });
    setPayments([{ id: newKey(), method: 'cash', amount: 0 }]);
    setPaymentsTouched(false);
    setCustomer(null); setCustomerType('b2c'); setCustomerGstin('');
    setRx({ enabled: false, doctorId: null, doctorName: '', imagePath: null });
    setSelectedRowIdx(-1);
    setQuery(''); setError(null); setLastBill(null);
    try { localStorage.removeItem(draftKey); } catch { /* localStorage unavailable */ }
    searchInputRef.current?.focus();
  }, [draftKey]);

  // Swap the batch on a cart line (Phase B). New batch may have different
  // MRP/selling/GST/purchase rate — refresh those + clamp qty to new stock.
  function swapBatch(lineKey: string, batch: PosBatchOption) {
    setLines((prev) => prev.map((l) => l.key === lineKey ? {
      ...l,
      batch_id: batch.batch_id, batch_number: batch.batch_number, expiry_date: batch.expiry_date,
      mrp: Number(batch.selling_price ?? batch.mrp ?? 0),
      gst_percentage: Number(batch.gst_percentage ?? 0),
      purchase_rate: Number(batch.purchase_rate ?? 0),
      stock_available: batch.current_quantity,
      quantity: Math.min(l.quantity, batch.current_quantity),
    } : l));
    setBatchPickerFor(null);
  }

  // ── Customer side-effects ─────────────────────────────────
  // Selecting a customer auto-loads their profile-level special discount.
  // Removing the customer clears it. This is read-only on the POS — the
  // cashier edits it on the customer record itself.
  useEffect(() => {
    if (customer) {
      setCustomerType(customer.customer_type === 'b2b' ? 'b2b' : 'b2c');
      setCustomerGstin(customer.gstin ?? '');
      if (customer.special_discount_type && customer.special_discount_value > 0) {
        setSpecialDiscount({
          type: customer.special_discount_type,
          value: customer.special_discount_value,
          label: customer.special_discount_label ?? null,
        });
      } else {
        setSpecialDiscount({ type: null, value: 0, label: null });
      }
    } else {
      setSpecialDiscount({ type: null, value: 0, label: null });
    }
  }, [customer]);

  // ── Bill math ─────────────────────────────────────────────
  // Inter-state GST detection: customer_state set AND differs from store_state.
  const interState = customer?.state && storeState && customer.state.trim().toLowerCase() !== storeState.trim().toLowerCase();
  const gstType: 'cgst_sgst' | 'igst' = interState ? 'igst' : 'cgst_sgst';

  const billLines: BillLineInput[] = useMemo(() => {
    const cartLines: BillLineInput[] = lines.map((l) => ({
      mrp: l.mrp, quantity: l.quantity, gstPercentage: l.gst_percentage,
      discountPercentage: l.discount_type === 'percent' ? l.discount_value : undefined,
      flatDiscount: l.discount_type === 'flat' ? l.discount_value : undefined,
    }));
    const miscLines: BillLineInput[] = miscCharges
      .filter((c) => c.amount > 0)
      .map((c) => ({ mrp: c.amount, quantity: 1, gstPercentage: 0, isMiscItem: true }));
    return [...cartLines, ...miscLines];
  }, [lines, miscCharges]);

  const summary = useMemo(() => {
    // Pass 1: medicineSubtotal (basis for both bill + special discount caps).
    const pre = computeBill({ lines: billLines, gstType, roundOff: false });
    const medSub = pre.medicineSubtotal;

    // Layer 2 — manual bill discount, capped at medSub.
    let billDiscAmt = 0;
    if (billDiscount.type === 'percent' && billDiscount.value > 0) {
      billDiscAmt = Math.min((medSub * billDiscount.value) / 100, medSub);
    } else if (billDiscount.type === 'flat' && billDiscount.value > 0) {
      billDiscAmt = Math.min(billDiscount.value, medSub);
    }

    // Layer 3 — customer special discount, stacks on remaining medSub.
    let specialAmt = 0;
    const remaining = Math.max(0, medSub - billDiscAmt);
    if (specialDiscount.type === 'percentage' && specialDiscount.value > 0) {
      specialAmt = Math.min((remaining * specialDiscount.value) / 100, remaining);
    } else if (specialDiscount.type === 'flat' && specialDiscount.value > 0) {
      specialAmt = Math.min(specialDiscount.value, remaining);
    }

    return computeBill({
      lines: billLines, gstType,
      billDiscountAmount: billDiscAmt,
      specialDiscountAmount: specialAmt,
      roundOff: true,
    });
  }, [billLines, gstType, billDiscount, specialDiscount]);

  // Total of per-row "medicine" discounts (display purposes — already baked
  // into each line's grossAmount via bill-math).
  const lineDiscountTotal = useMemo(() => {
    let total = 0;
    for (const l of lines) {
      if (l.discount_type === 'none' || l.discount_value <= 0) continue;
      const rawGross = l.mrp * l.quantity;
      const after = l.discount_type === 'percent'
        ? rawGross * (1 - l.discount_value / 100)
        : Math.max(0, rawGross - l.discount_value);
      total += Math.max(0, rawGross - after);
    }
    return Math.round(total * 100) / 100;
  }, [lines]);

  // Bill profit (D8 default visible; cashier role hide can come later).
  const billProfit = useMemo(() => {
    const revenue = summary.subtotal - summary.discountAmount - summary.specialDiscountAmount;
    const cost = lines.reduce((s, l) => s + l.purchase_rate * l.quantity, 0);
    return { revenue, cost, profit: revenue - cost, margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0 };
  }, [summary, lines]);

  // ── Payment auto-balance ──────────────────────────────────
  // Single-payment mode (the common case): the lone payment row mirrors the
  // bill total automatically — through every discount/qty/misc change —
  // until the cashier manually edits the amount or splits the payment.
  // After that, it's strictly under cashier control.
  const [paymentsTouched, setPaymentsTouched] = useState(false);
  const paymentsSum = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const paymentRemaining = summary.totalAmount - paymentsSum;
  useEffect(() => {
    if (paymentsTouched) return;
    if (payments.length !== 1) return;
    const p = payments[0]!;
    if (p.amount === summary.totalAmount) return;
    setPayments([{ ...p, amount: summary.totalAmount }]);
  }, [summary.totalAmount, payments, paymentsTouched]);

  // ── Save ──────────────────────────────────────────────────
  const onSave = useCallback(async () => {
    if (lines.length === 0 && miscCharges.length === 0) return;
    if (paymentsSum <= 0) { setError('Add at least one payment amount.'); return; }
    if (Math.abs(paymentRemaining) > 0.5) {
      setError(`Payment is off by ₹${paymentRemaining.toFixed(2)}. Adjust the payment amount or discounts.`);
      return;
    }
    setError(null); setSaving(true);
    try {
      const billNumber = await posNextBillNumber(supabase, storeId);
      const clientUuid = globalThis.crypto.randomUUID();

      // Real cart items map 1:1 with summary.lines[0..lines.length-1].
      const realItems: SaleLineItem[] = lines.map((l, i) => {
        const s = summary.lines[i]!;
        return {
          medicine_id: l.medicine_id, batch_id: l.batch_id,
          quantity: l.quantity, mrp: l.mrp, gst_percentage: l.gst_percentage,
          item_discount_type: l.discount_type === 'none' ? undefined : (l.discount_type === 'percent' ? 'percentage' : 'flat'),
          item_discount_value: l.discount_type === 'none' ? undefined : l.discount_value,
          taxable_amount: s.taxableAmount,
          cgst_percentage: s.cgstPercentage, sgst_percentage: s.sgstPercentage, igst_percentage: s.igstPercentage,
          cgst_amount: s.cgstAmount, sgst_amount: s.sgstAmount, igst_amount: s.igstAmount,
          amount: s.amount,
        };
      });
      // Misc lines come after the real ones in summary.lines.
      const miscItems: SaleLineItem[] = miscCharges
        .filter((c) => c.amount > 0)
        .map((c, j) => {
          const s = summary.lines[lines.length + j]!;
          return {
            is_misc_item: true, misc_note: c.note || 'Misc',
            quantity: 1, mrp: c.amount, gst_percentage: 0,
            taxable_amount: s.taxableAmount,
            cgst_amount: 0, sgst_amount: 0, igst_amount: 0,
            amount: s.amount,
          };
        });

      const paymentRows: SalePayment[] = payments
        .filter((p) => p.amount > 0)
        .map((p) => ({
          payment_method: p.method, amount: p.amount,
          reference_number: p.reference ?? undefined,
        }));

      const hasCredit = paymentRows.some((p) => p.payment_method === 'credit');
      const result = await rpcCommitSale(supabase, {
        client_uuid: clientUuid,
        store_id: storeId,
        bill_number: billNumber,
        customer_id: customer?.id ?? null,
        customer_type: customerType,
        customer_gstin: customerGstin.trim() || null,
        customer_state: customer?.state ?? null,
        is_prescription_sale: rx.enabled,
        doctor_id: rx.enabled ? rx.doctorId ?? undefined : undefined,
        doctor_name: rx.enabled && rx.doctorName.trim() ? rx.doctorName.trim() : undefined,
        prescription_image_path: rx.enabled ? rx.imagePath : null,
        subtotal: summary.subtotal,
        taxable_amount: summary.taxableAmount,
        gst_amount: summary.gstAmount,
        cgst_amount: summary.cgstAmount,
        sgst_amount: summary.sgstAmount,
        igst_amount: summary.igstAmount,
        discount_amount: summary.discountAmount,
        special_discount_amount: summary.specialDiscountAmount,
        special_discount_label: specialDiscount.label?.trim() || null,
        misc_charge: summary.miscCharge,
        round_off: summary.roundOff,
        total_amount: summary.totalAmount,
        payment_method: paymentRows.length > 1 ? 'split' : paymentRows[0]?.payment_method ?? 'cash',
        payment_status: hasCredit ? 'credit' : 'paid',
        paid_amount: paymentRows.filter((p) => p.payment_method !== 'credit').reduce((s, p) => s + p.amount, 0),
        source: 'web',
        items: [...realItems, ...miscItems],
        payments: paymentRows,
      });

      setLastBill({ number: result.billNumber, id: result.saleId });
      setCompletedSaleId(result.saleId);
      clearAll();
      setQuickAccessSignal((n) => n + 1); // refresh fast-moving / customer history
      router.refresh();
    } catch (e) {
      const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to save sale';
      setError(msg);
    } finally { setSaving(false); }
  }, [
    lines, miscCharges, payments, paymentsSum, paymentRemaining, summary,
    customer, customerType, customerGstin, rx, specialDiscount,
    storeId, supabase, router, clearAll,
  ]);

  // ── Hotkeys ───────────────────────────────────────────────
  useHotkey('F1', (e) => { e.preventDefault(); setHelpOpen((v) => !v); }, []);
  useHotkey('F2', () => { if (lines.length === 0 || confirm('Discard current bill?')) clearAll(); }, [lines]);
  useHotkey('F4', (e) => {
    e.preventDefault();
    setCustomerSearchOpen(true);
    setTimeout(() => customerInputRef.current?.focus(), 0);
  }, []);
  useHotkey('F9', (e) => {
    e.preventDefault();
    if (!saving && (lines.length > 0 || miscCharges.length > 0)) onSave();
  }, [lines, miscCharges, saving, summary]);
  useHotkey('Escape', () => {
    if (helpOpen) { setHelpOpen(false); return; }
    if (showResults) { setShowResults(false); return; }
    if (customerSearchOpen) { setCustomerSearchOpen(false); return; }
    if ((lines.length > 0 || miscCharges.length > 0) && confirm('Discard current bill?')) clearAll();
  }, [lines, miscCharges, showResults, helpOpen, customerSearchOpen]);

  // Extra hotkeys (Ctrl/Alt variants + Phase B). Window listener bypasses the
  // input-only suppression the useHotkey wrapper applies.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ctrl+Shift+N → quick-add customer (Phase B)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault(); setQuickAddCustomerOpen(true); return;
      }
      // Alt+H → open hotkey manager (Phase C). Bare Alt+letter is unused by browsers
      // for the H key in our common keyboard layouts.
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault(); setHotkeyManagerOpen(true); return;
      }
      // Ctrl+P → reopen Sale Complete modal for the last saved bill (Phase D).
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'p' && lastBill) {
        e.preventDefault();
        setCompletedSaleId(lastBill.id);
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); searchInputRef.current?.focus(); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        setCustomerSearchOpen(true);
        setTimeout(() => customerInputRef.current?.focus(), 0); return;
      }
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (!saving && (lines.length > 0 || miscCharges.length > 0)) onSave();
        return;
      }
      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-pos-section]'));
        if (sections.length === 0) return;
        const focused = document.activeElement as HTMLElement | null;
        const i = sections.findIndex((s) => s === focused || s.contains(focused));
        const next = e.key === 'ArrowRight'
          ? Math.min((i === -1 ? 0 : i) + 1, sections.length - 1)
          : Math.max((i === -1 ? 0 : i) - 1, 0);
        const target = sections[next];
        (target?.querySelector<HTMLElement>('input, button, select, textarea') ?? target)?.focus();
        target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      // ── Phase B: Cart row navigation + type-the-qty ──
      // Only active when focus is NOT inside an input/select/textarea and there are cart lines.
      const active = document.activeElement as HTMLElement | null;
      const inEditable = !!active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
      if (inEditable || lines.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedRowIdx((i) => (i < 0 ? 0 : Math.min(i + 1, lines.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedRowIdx((i) => (i < 0 ? 0 : Math.max(i - 1, 0)));
      } else if (selectedRowIdx >= 0 && selectedRowIdx < lines.length) {
        // Type-the-qty: digit pressed on a selected row → focus qty input and seed with the digit.
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          const line = lines[selectedRowIdx]!;
          const input = qtyInputRefs.current[line.key];
          if (input) {
            input.value = e.key; input.focus(); input.select();
            updateLine(line.key, { quantity: Math.min(Number(e.key), line.stock_available) });
          }
        } else if (e.key === 'Enter') {
          // Enter on a selected row opens batch picker — Marg-style swap.
          e.preventDefault();
          setBatchPickerFor(lines[selectedRowIdx]!);
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          const line = lines[selectedRowIdx]!;
          removeLine(line.key);
          setSelectedRowIdx((i) => Math.min(i, lines.length - 2));
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lines, miscCharges, saving, summary, selectedRowIdx, lastBill, onSave]);

  // Keyboard nav inside the search dropdown.
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showResults || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); const pick = results[highlight]; if (pick) addLine(pick); }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Resume-draft banner */}
      {resumeAvailable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-sm text-amber-900">
            <strong>Unsaved bill found.</strong> {resumeAvailable.lines.length} line{resumeAvailable.lines.length === 1 ? '' : 's'},
            {resumeAvailable.miscCharges.length > 0 && ` ${resumeAvailable.miscCharges.length} misc charge${resumeAvailable.miscCharges.length === 1 ? '' : 's'},`}
            {' '}saved {timeAgo(resumeAvailable.savedAt)}.
          </div>
          <div className="flex gap-2">
            <button onClick={discardDraft} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">Discard</button>
            <button onClick={resumeDraft} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">Resume</button>
          </div>
        </div>
      )}

      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-emerald-700">New sale</div>
          <div className="mt-0.5 text-sm font-semibold text-zinc-900">
            {storeName} <span className="font-mono text-xs text-zinc-500">· {storeCode}</span>
            {interState && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Inter-state · IGST</span>}
          </div>
        </div>
        <div className="hidden flex-wrap gap-3 text-xs text-zinc-600 sm:flex">
          <Hint k="F1">Help</Hint>
          <Hint k="F4">Customer</Hint>
          <Hint k="F9">Save</Hint>
          <Hint k="F2">New bill</Hint>
        </div>
      </div>

      {/* Quick Access strip (Phase C) — sits between header and main grid */}
      <QuickAccessStrip
        storeId={storeId}
        customerId={customer?.id ?? null}
        onAdd={addLine}
        onPin={(m) => setPinPickerFor({ medicineId: m.medicine_id, name: m.name })}
        refreshSignal={quickAccessSignal}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* LEFT: search + cart + misc */}
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <input
              ref={searchInputRef} autoFocus type="text" value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { registerKeystroke(e); onSearchKey(e); }}
              onFocus={() => results.length > 0 && setShowResults(true)}
              data-pos-section="search"
              placeholder="Type medicine name or scan barcode… (Ctrl+F)"
              className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
            />
            {isScanning && (
              <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14" stroke="currentColor" strokeWidth="1.75"/></svg>
                SCAN
              </div>
            )}
            {searching && !isScanning && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">searching…</div>}
            {showResults && !isScanning && results.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
                {results.map((r, i) => {
                  const inStock = (r.current_quantity ?? 0) > 0;
                  return (
                    <li
                      key={`${r.medicine_id}-${r.batch_id ?? 'nostock'}`}
                      onMouseEnter={() => setHighlight(i)}
                      onMouseDown={(e) => { e.preventDefault(); addLine(r); }}
                      className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm ${i === highlight ? 'bg-emerald-50' : 'hover:bg-zinc-50'} ${!inStock ? 'opacity-50' : ''}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-zinc-900">{r.name}</div>
                        <div className="truncate text-xs text-zinc-500">
                          {r.manufacturer || '—'}
                          {r.batch_number && <> · Batch {r.batch_number}</>}
                          {r.expiry_date && <> · Exp {r.expiry_date.slice(0, 7)}</>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-sm text-zinc-900">₹{Number(r.selling_price ?? r.mrp ?? 0).toFixed(2)}</div>
                        <div className="text-[11px] text-zinc-500">{inStock ? `${r.current_quantity} in stock` : 'out of stock'}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Cart */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5">Medicine</th>
                  <th className="px-3 py-2.5">Batch / Exp</th>
                  <th className="w-20 px-3 py-2.5 text-right">MRP</th>
                  <th className="w-20 px-3 py-2.5 text-center">Qty</th>
                  <th className="w-36 px-3 py-2.5 text-center">Discount</th>
                  <th className="w-14 px-3 py-2.5 text-right">GST</th>
                  <th className="w-24 px-3 py-2.5 text-right">Amount</th>
                  <th className="w-8 px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-sm text-zinc-400">
                      {lastBill ? (
                        <div className="space-y-1">
                          <div className="font-medium text-emerald-700">✓ Bill {lastBill.number} saved</div>
                          <div>Start typing to add the next bill.</div>
                        </div>
                      ) : 'Search and add medicines to start a bill.'}
                    </td>
                  </tr>
                ) : lines.map((l, i) => {
                  const lineAmount = summary.lines[i]?.amount ?? 0;
                  const isSelected = i === selectedRowIdx;
                  return (
                    <tr key={l.key}
                      onClick={() => setSelectedRowIdx(i)}
                      className={`cursor-pointer transition ${isSelected ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-200' : 'hover:bg-zinc-50/60'}`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-zinc-900">{l.medicine_name}</div>
                        <div className="mt-0.5 flex gap-2">
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); setBatchPickerFor(l); }}
                            className="text-[10px] font-semibold text-indigo-600 hover:underline"
                          >Change batch</button>
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); setBrandCompareFor(l); }}
                            className="text-[10px] font-semibold text-emerald-600 hover:underline"
                          >Compare brands</button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {l.batch_number}{l.expiry_date && <> · {l.expiry_date.slice(0, 7)}</>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-700">₹{l.mrp.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <input type="number" min={1} max={l.stock_available} value={l.quantity}
                          ref={(el) => { qtyInputRefs.current[l.key] = el; }}
                          onChange={(e) => updateLine(l.key, { quantity: Math.max(1, Math.min(parseInt(e.target.value, 10) || 1, l.stock_available)) })}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <LineDiscountControl
                          type={l.discount_type} value={l.discount_value}
                          onChange={(type, value) => updateLine(l.key, { discount_type: type, discount_value: value })}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-zinc-500">{l.gst_percentage}%</td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-zinc-900">₹{lineAmount.toFixed(2)}</td>
                      <td className="px-2 py-2">
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeLine(l.key); }} className="text-zinc-400 hover:text-rose-600" aria-label="Remove">
                          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Misc / Note charges */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm" data-pos-section="misc">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Misc / Note charges {miscCharges.length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{miscCharges.length}</span>}
              </div>
              <button onClick={addMisc} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">+ Add charge</button>
            </div>
            {miscCharges.length === 0 ? (
              <p className="text-xs text-zinc-400">Delivery, packing, doctor consultation, etc. — added on top of the bill, no GST.</p>
            ) : (
              <ul className="space-y-1.5">
                {miscCharges.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <input value={c.note} onChange={(e) => updateMisc(c.id, { note: e.target.value })}
                      placeholder="e.g. Home delivery"
                      className="flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                    <span className="text-zinc-400">₹</span>
                    <input type="number" min={0} step={0.01} value={c.amount || ''}
                      onChange={(e) => updateMisc(c.id, { amount: Number(e.target.value) || 0 })}
                      className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right font-mono text-sm focus:border-emerald-500 focus:outline-none"
                    />
                    <button onClick={() => removeMisc(c.id)} className="text-zinc-400 hover:text-rose-600">
                      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <Alert variant="error">{error}</Alert>}
        </div>

        {/* RIGHT: customer · special discount · totals · payment · save */}
        <aside className="space-y-3">
          {/* Customer */}
          <div className="relative rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm" data-pos-section="customer">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Customer</div>
              <button type="button" onClick={() => { setCustomerSearchOpen(true); setTimeout(() => customerInputRef.current?.focus(), 0); }}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >{customer ? 'Change' : 'Pick · F4'}</button>
            </div>
            {customer ? (
              <>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">{customer.name}</div>
                    <div className="truncate text-xs text-zinc-500">{customer.phone || '—'} · {customer.customer_type.toUpperCase()}</div>
                  </div>
                  <button type="button" onClick={() => setCustomer(null)} className="text-zinc-400 hover:text-rose-600">
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  </button>
                </div>
                {customer.outstanding > 0 && (
                  <div className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800 ring-1 ring-amber-200">
                    Outstanding ₹{customer.outstanding.toFixed(2)}
                  </div>
                )}
                <button onClick={onReorderLastBill} disabled={reorderLoading}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" fill="none" className={`h-3.5 w-3.5 ${reorderLoading ? 'animate-spin' : ''}`}>
                    {reorderLoading
                      ? <path d="M21 12a9 9 0 1 1-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                      : <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>}
                  </svg>
                  {reorderLoading ? 'Loading…' : 'Reorder last bill'}
                </button>
              </>
            ) : (
              <>
                <div className="mt-1 text-sm font-semibold text-zinc-900">Walk-in</div>
                <div className="text-xs text-zinc-500">{storeState || 'Intra-state'} GST</div>
              </>
            )}

            {/* Customer-type pills + optional GSTIN */}
            <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-lg bg-zinc-50 p-1">
              {(['b2c', 'b2b'] as CustomerType[]).map((t) => (
                <button key={t} type="button" onClick={() => setCustomerType(t)}
                  className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${customerType === t ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-500 hover:text-zinc-700'}`}
                >{t === 'b2c' ? 'B2C' : 'B2B / GSTIN'}</button>
              ))}
            </div>
            {customerType === 'b2b' && (
              <input value={customerGstin} onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                placeholder="GSTIN (15 chars)" maxLength={15}
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs uppercase focus:border-emerald-500 focus:outline-none"
              />
            )}

            {customerSearchOpen && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-zinc-200 bg-white shadow-lg">
                <div className="border-b border-zinc-100 p-2">
                  <input ref={customerInputRef} type="text" value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setCustomerSearchOpen(false); setCustomerQuery(''); } }}
                    onBlur={() => setTimeout(() => setCustomerSearchOpen(false), 150)}
                    placeholder="Search by name or phone…"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                {customerResults.length > 0 ? (
                  <ul className="max-h-64 overflow-y-auto py-1">
                    {customerResults.map((c) => (
                      <li key={c.id}
                        onMouseDown={(e) => { e.preventDefault(); setCustomer(c); setCustomerSearchOpen(false); setCustomerQuery(''); setCustomerResults([]); searchInputRef.current?.focus(); }}
                        className="cursor-pointer px-3 py-2 text-sm hover:bg-emerald-50"
                      >
                        <div className="font-medium text-zinc-900">{c.name}</div>
                        <div className="text-xs text-zinc-500">
                          {c.phone || '—'} · {c.customer_type.toUpperCase()}
                          {c.outstanding > 0 && <span className="ml-1 text-amber-700">· ₹{c.outstanding.toFixed(0)} due</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-3 py-3 text-xs text-zinc-400">
                    {customerQuery.trim() ? 'No customers match — type the full name or phone.' : 'Start typing to search.'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Doctor / Prescription (Phase B) */}
          <DoctorPrescriptionSection
            storeId={storeId}
            orgId={orgId}
            enabled={rx.enabled}
            doctorId={rx.doctorId}
            doctorName={rx.doctorName}
            imagePath={rx.imagePath}
            onChange={setRx}
          />

          {/* Bill discount — manual, cashier-typed, on medicineSubtotal */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm" data-pos-section="bill-discount">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Bill discount</div>
              <div className="text-[10px] text-zinc-400">on medicines subtotal</div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-zinc-50 p-1">
              {(['none', 'percent', 'flat'] as BillDiscountType[]).map((t) => (
                <button key={t} type="button" onClick={() => setBillDiscount((s) => ({ type: t, value: t === 'none' ? 0 : s.value }))}
                  className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${billDiscount.type === t ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-500 hover:text-zinc-700'}`}
                >{t === 'none' ? 'OFF' : t === 'percent' ? '%' : '₹'}</button>
              ))}
            </div>
            {billDiscount.type !== 'none' && (
              <input type="number" min={0} step={billDiscount.type === 'percent' ? 0.5 : 0.01}
                max={billDiscount.type === 'percent' ? 100 : undefined}
                value={billDiscount.value || ''}
                onChange={(e) => setBillDiscount((s) => ({ ...s, value: Number(e.target.value) || 0 }))}
                placeholder={billDiscount.type === 'percent' ? '%' : '₹'}
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-right font-mono text-sm focus:border-emerald-500 focus:outline-none"
              />
            )}
          </div>

          {/* Customer special discount — read-only, derived from selected customer profile */}
          {specialDiscount.type && specialDiscount.value > 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm" data-pos-section="special-discount">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wider text-emerald-700">Special discount</div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700">Auto · {customer?.name ?? 'customer'}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-emerald-900">
                    {specialDiscount.label || 'Customer special discount'}
                  </div>
                  <div className="text-[11px] text-emerald-700">
                    {specialDiscount.type === 'percentage'
                      ? `${specialDiscount.value}% off remaining medicines subtotal`
                      : `Flat ₹${specialDiscount.value.toFixed(2)} off`}
                  </div>
                </div>
                <span className="font-mono text-sm font-bold text-emerald-800">
                  −₹{summary.specialDiscountAmount.toFixed(2)}
                </span>
              </div>
              <p className="mt-2 text-[10px] text-emerald-700/80">Edit on the customer record to change.</p>
            </div>
          ) : customer ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/40 p-3 text-center text-[11px] text-zinc-400" data-pos-section="special-discount">
              No special discount on this customer
            </div>
          ) : null}

          {/* Totals */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <TotalRow label="Subtotal" value={summary.subtotal} />
            {lineDiscountTotal > 0 && (
              <TotalRow label="Medicine discounts" value={-lineDiscountTotal} accent="emerald" />
            )}
            {summary.discountAmount > 0 && (
              <TotalRow
                label={`Bill discount${billDiscount.type === 'percent' ? ` (${billDiscount.value}%)` : ''}`}
                value={-summary.discountAmount}
                accent="emerald"
              />
            )}
            {summary.specialDiscountAmount > 0 && (
              <TotalRow
                label={`Special discount${specialDiscount.label ? ` · ${specialDiscount.label}` : ''}`}
                value={-summary.specialDiscountAmount}
                accent="emerald"
              />
            )}
            {gstType === 'igst' ? (
              <TotalRow label="IGST" value={summary.igstAmount} muted />
            ) : (
              <>
                <TotalRow label="CGST" value={summary.cgstAmount} muted />
                <TotalRow label="SGST" value={summary.sgstAmount} muted />
              </>
            )}
            {summary.miscCharge > 0 && <TotalRow label="Misc charges" value={summary.miscCharge} muted />}
            {summary.roundOff !== 0 && <TotalRow label="Round off" value={summary.roundOff} muted />}
            <div className="mt-2 border-t border-zinc-100 pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-zinc-700">Total</span>
                <span className="font-mono text-2xl font-extrabold text-zinc-900">₹{summary.totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Bill profit */}
          {lines.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
              <div className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-emerald-700">
                <span>Bill profit</span>
                <span className="font-mono text-[10px] text-emerald-600">{billProfit.margin.toFixed(1)}% margin</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-emerald-700">Revenue ₹{billProfit.revenue.toFixed(2)} · Cost ₹{billProfit.cost.toFixed(2)}</span>
                <span className={`font-mono text-lg font-bold ${billProfit.profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  ₹{billProfit.profit.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Payment (split-capable) */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm" data-pos-section="payment">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Payment</div>
              <button onClick={addPayment} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">+ Split</button>
            </div>
            <ul className="space-y-1.5">
              {payments.map((p, idx) => (
                <li key={p.id} className="flex items-center gap-1.5">
                  <select value={p.method} onChange={(e) => updatePayment(p.id, { method: e.target.value as PayMethod })}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs font-semibold focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="cash">CASH</option>
                    <option value="upi">UPI</option>
                    <option value="card">CARD</option>
                    <option value="credit">CREDIT</option>
                  </select>
                  <span className="text-zinc-400">₹</span>
                  <input type="number" min={0} step={0.01} value={p.amount || ''}
                    onChange={(e) => updatePayment(p.id, { amount: Number(e.target.value) || 0 })}
                    className="flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right font-mono text-sm focus:border-emerald-500 focus:outline-none"
                  />
                  {payments.length > 1 && (
                    <button onClick={() => removePayment(p.id)} className="text-zinc-400 hover:text-rose-600">
                      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    </button>
                  )}
                  {idx === 0 && payments.length === 1 && <span className="text-[10px] text-zinc-400">single</span>}
                </li>
              ))}
            </ul>
            {payments.length > 1 && (
              <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-2 text-xs">
                <span className="text-zinc-500">Sum ₹{paymentsSum.toFixed(2)}</span>
                <span className={`font-mono font-bold ${Math.abs(paymentRemaining) < 0.5 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {paymentRemaining >= 0 ? `Remaining ₹${paymentRemaining.toFixed(2)}` : `Over ₹${(-paymentRemaining).toFixed(2)}`}
                </span>
              </div>
            )}
          </div>

          <Button onClick={onSave} loading={saving} disabled={lines.length === 0 && miscCharges.length === 0} size="lg" className="w-full">
            Save bill · F9
          </Button>
          <Button onClick={clearAll} variant="ghost" className="w-full" disabled={lines.length === 0 && miscCharges.length === 0 && !lastBill}>
            New bill · F2
          </Button>

          <div className="px-1 text-[11px] text-zinc-400">Org: {orgName}</div>
        </aside>
      </div>

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}

      {batchPickerFor && (
        <BatchPickerModal
          open
          storeId={storeId}
          medicineId={batchPickerFor.medicine_id}
          medicineName={batchPickerFor.medicine_name}
          currentBatchId={batchPickerFor.batch_id}
          onClose={() => setBatchPickerFor(null)}
          onPick={(b) => swapBatch(batchPickerFor.key, b)}
        />
      )}

      {brandCompareFor && (
        <BrandComparisonModal
          open
          storeId={storeId}
          medicineId={brandCompareFor.medicine_id}
          medicineName={brandCompareFor.medicine_name}
          onClose={() => setBrandCompareFor(null)}
          onSwitch={(alt) => {
            // Pop the original line, add the alt via id, close modal.
            const key = brandCompareFor.key;
            removeLine(key);
            addByMedicineId(alt.id);
            setBrandCompareFor(null);
          }}
        />
      )}

      <HotkeyManagerModal
        open={hotkeyManagerOpen}
        onClose={() => setHotkeyManagerOpen(false)}
        storeId={storeId}
        groups={hotkeyGroups}
        onChange={refetchHotkeys}
      />

      {/* Pin-picker shown when user right-clicks a Quick Access tile: adds the
          medicine to the picked group (server-side). */}
      {pinPickerFor && (
        <PinDigitPicker
          entry={pinPickerFor}
          groups={hotkeyGroups}
          onClose={() => setPinPickerFor(null)}
          onPick={async (digit) => {
            try {
              await posAddHotkeyMedicine(supabase, storeId, digit, pinPickerFor.medicineId, 1);
              await refetchHotkeys();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Failed to add to group');
            }
            setPinPickerFor(null);
          }}
        />
      )}

      <SaleCompleteModal
        open={completedSaleId !== null}
        saleId={completedSaleId}
        storeId={storeId}
        onClose={() => setCompletedSaleId(null)}
        onNewBill={() => { setCompletedSaleId(null); setLastBill(null); searchInputRef.current?.focus(); }}
      />

      <QuickAddCustomerModal
        open={quickAddCustomerOpen}
        storeId={storeId}
        onClose={() => setQuickAddCustomerOpen(false)}
        onCreated={(c: Customer) => {
          // Project the created Customer into the POS picker shape so customer
          // state + IGST detection + outstanding all work without re-fetching.
          setCustomer({
            id: c.id, name: c.name, phone: c.phone ?? '',
            email: c.email ?? null,
            customer_type: (c.customer_type as 'b2c' | 'b2b') ?? 'b2c',
            gstin: c.gstin ?? null, state: c.state ?? null, outstanding: 0,
            // New customers from quick-add have no special discount yet —
            // the cashier sets it on the customer record after.
            special_discount_type: null,
            special_discount_value: 0,
            special_discount_label: null,
          });
        }}
      />
    </div>
  );
}

// ── Helpers / sub-components ──────────────────────────────

function LineDiscountControl({
  type, value, onChange,
}: { type: LineDiscountType; value: number; onChange: (t: LineDiscountType, v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <select value={type} onChange={(e) => onChange(e.target.value as LineDiscountType, e.target.value === 'none' ? 0 : value)}
        className="rounded-md border border-zinc-300 bg-white px-1 py-1 text-[11px] font-bold focus:border-emerald-500 focus:outline-none"
      >
        <option value="none">—</option>
        <option value="percent">%</option>
        <option value="flat">₹</option>
      </select>
      {type !== 'none' && (
        <input type="number" min={0} step={type === 'percent' ? 0.5 : 0.01} value={value || ''}
          onChange={(e) => onChange(type, Number(e.target.value) || 0)}
          className="w-full rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-right font-mono text-xs focus:border-emerald-500 focus:outline-none"
        />
      )}
    </div>
  );
}

function TotalRow({ label, value, muted = false, accent }: {
  label: string; value: number; muted?: boolean; accent?: 'emerald' | 'rose';
}) {
  const cls = accent === 'emerald' ? 'text-emerald-700'
    : accent === 'rose' ? 'text-rose-600'
    : muted ? 'text-zinc-500' : 'text-zinc-700';
  return (
    <div className={`flex items-baseline justify-between py-0.5 text-sm ${cls}`}>
      <span className="truncate pr-2">{label}</span>
      <span className="font-mono tabular-nums">{value < 0 ? '−' : ''}₹{Math.abs(value).toFixed(2)}</span>
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

function HelpOverlay({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['Ctrl+F', 'Focus medicine search'],
    ['Ctrl+R', 'Focus / open customer'],
    ['Ctrl+Shift+N', 'Quick-add new customer'],
    ['Alt+H', 'Manage Alt+1–9 hotkeys'],
    ['Alt+1–9', 'Add pinned medicine to cart'],
    ['Ctrl+P', 'Reopen last bill for print/share'],
    ['Ctrl+Enter', 'Save bill (alias of F9)'],
    ['Alt+→ / Alt+←', 'Walk between sections'],
    ['F1', 'Toggle this overlay'],
    ['F2', 'New bill (clears cart)'],
    ['F4', 'Open customer picker'],
    ['F9', 'Save bill'],
    ['Esc', 'Close popover / cancel bill'],
    ['↑ ↓', 'Search dropdown / cart row select'],
    ['Enter (search)', 'Add highlighted result'],
    ['Enter (cart row)', 'Open batch picker for the row'],
    ['0–9 (cart row)', 'Type-the-qty Marg style'],
    ['Del / Backspace (cart row)', 'Remove the row'],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-900">Keyboard shortcuts</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100">
            {rows.map(([k, d]) => (
              <tr key={k}>
                <td className="py-1.5 pr-3">
                  <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-zinc-700">{k}</kbd>
                </td>
                <td className="py-1.5 text-zinc-700">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Inline modal: "add this medicine to which Alt+digit group?". Shows each
// digit with its current group name + item count so the user knows what
// they're adding to.
function PinDigitPicker({
  entry, groups, onClose, onPick,
}: {
  entry: { medicineId: string; name: string };
  groups: import('@shelfcure/api-client').PosHotkeyGroup[];
  onClose: () => void;
  onPick: (digit: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="mb-1 text-base font-bold text-zinc-900">Add to hotkey group</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Add <strong className="text-zinc-900">{entry.name}</strong> to a group.
          Alt+digit on the POS adds the whole group to the cart. <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 font-mono text-[9px]">Alt+H</kbd> opens the full manager.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3,4,5,6,7,8,9].map((d) => {
            const g = groups.find((x) => x.digit === d);
            const populated = (g?.items.length ?? 0) > 0;
            const alreadyHas = g?.items.some((i) => i.medicine_id === entry.medicineId);
            return (
              <button
                key={d}
                disabled={alreadyHas}
                onClick={() => onPick(d)}
                className="rounded-lg border border-zinc-200 bg-white p-2 text-left hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <div className="font-mono text-xs font-bold text-zinc-700">Alt+{d}</div>
                <div className={`mt-0.5 truncate text-[10px] ${populated ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  {g?.name ?? (populated ? `${g!.items.length} items` : 'empty')}
                </div>
                {alreadyHas && <div className="text-[9px] font-bold text-emerald-600">already added</div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
