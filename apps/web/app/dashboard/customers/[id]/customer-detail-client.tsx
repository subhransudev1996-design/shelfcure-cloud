'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  updateCustomer,
  recordCustomerPayment,
  upsertCustomerRoutine,
  deleteCustomerRoutine,
  listMedicines,
  type CustomerDetail,
  type CustomerLedgerEntry,
  type CustomerRoutineItem,
  type CustomerSaleRow,
  type CustomerReturnRow,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Alert } from '../../../../components/form-fields';

interface Props {
  detail: CustomerDetail;
  ledger: CustomerLedgerEntry[];
  routine: CustomerRoutineItem[];
  sales: CustomerSaleRow[];
  returns: CustomerReturnRow[];
}

const INR = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PAYMENT_METHODS = ['cash', 'upi', 'card', 'neft', 'rtgs', 'cheque', 'bank_transfer'];

const LEDGER_TYPE_LABEL: Record<string, string> = {
  sale: 'Sale',
  payment: 'Payment',
  return: 'Return',
  adjustment: 'Adjustment',
};

const LEDGER_TYPE_COLOR: Record<string, string> = {
  sale: 'text-red-700 bg-red-50',
  payment: 'text-emerald-700 bg-emerald-50',
  return: 'text-blue-700 bg-blue-50',
  adjustment: 'text-zinc-700 bg-zinc-50',
};

export function CustomerDetailClient({ detail, ledger, routine: initialRoutine, sales, returns }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const { customer, stats } = detail;

  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showRoutineDialog, setShowRoutineDialog] = useState(false);
  const [routine, setRoutine] = useState<CustomerRoutineItem[]>(initialRoutine);

  const outstandingBalance = Number(customer.outstanding_balance);
  const initials = customer.name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/customers" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
          {initials}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-900">{customer.name}</h1>
            {customer.customer_type === 'b2b' && (
              <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-700 ring-1 ring-violet-200">B2B</span>
            )}
          </div>
          {customer.phone && <p className="text-sm text-zinc-500">{customer.phone}</p>}
        </div>
        <div className="ml-auto flex gap-2">
          {outstandingBalance > 0 && (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Record Payment
            </button>
          )}
          <button
            onClick={() => setShowEditModal(true)}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Main layout: 2/3 content + 1/3 sidebar */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left 2/3 */}
        <div className="space-y-4 lg:col-span-2">
          {/* Ledger */}
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <h2 className="font-semibold text-zinc-900">Ledger</h2>
              <span className="text-xs text-zinc-500">{ledger.length} entries</span>
            </div>
            {ledger.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-400">No ledger entries yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {ledger.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${LEDGER_TYPE_COLOR[e.transaction_type] ?? 'text-zinc-700 bg-zinc-50'}`}>
                      {LEDGER_TYPE_LABEL[e.transaction_type] ?? e.transaction_type}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-sm">
                        <span className={`font-mono font-semibold ${e.transaction_type === 'payment' ? 'text-emerald-700' : 'text-red-700'}`}>
                          {e.transaction_type === 'payment' ? '−' : '+'}{INR(Math.abs(e.amount))}
                        </span>
                        <span className="text-xs text-zinc-500 font-mono">Bal: {INR(e.balance_after)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-zinc-500">
                        <span>{e.payment_method ?? e.notes ?? ''}</span>
                        <span>{fmtDate(e.created_at)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Sales */}
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <h2 className="font-semibold text-zinc-900">Sales Invoices</h2>
              <span className="text-xs text-zinc-500">{stats.sales_count} total</span>
            </div>
            {sales.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-400">No sales yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {sales.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/dashboard/sales/${s.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-medium text-indigo-700 text-sm">{s.bill_number}</span>
                          <span className="font-mono font-semibold text-zinc-900">{INR(s.total_amount)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-zinc-500">
                          <span>{fmtDate(s.bill_date)} · {s.items_count} items</span>
                          <PaymentStatusBadge status={s.payment_status} />
                        </div>
                      </div>
                      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-zinc-300">
                        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Returns */}
          {returns.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="font-semibold text-zinc-900">Return Bills</h2>
              </div>
              <ul className="divide-y divide-zinc-100">
                {returns.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-rose-700">{r.return_number}</span>
                        <span className="font-mono font-semibold text-zinc-900">{INR(r.total_amount)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-zinc-500">
                        <span>Inv: {r.bill_number} · {fmtDate(r.return_date)}</span>
                        {r.refund_method && <span className="uppercase tracking-wide">{r.refund_method}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Balance hero */}
          <div className={`rounded-2xl p-5 shadow-sm ${outstandingBalance > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Outstanding Balance</div>
            <div className={`mt-1 text-3xl font-black tabular-nums ${outstandingBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {INR(outstandingBalance)}
            </div>
            {outstandingBalance > 0 && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="mt-3 w-full rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Record Payment
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
            <SideRow label="Lifetime Value" value={INR(stats.lifetime_value)} />
            <SideRow label="Total Bills" value={String(stats.sales_count)} />
            <SideRow label="Avg Bill" value={INR(stats.avg_bill_value)} />
            <SideRow label="Returns" value={String(stats.returns_count)} />
            {customer.last_purchase_date && (
              <SideRow label="Last Purchase" value={fmtDate(customer.last_purchase_date)} />
            )}
          </div>

          {/* Customer info */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Profile</h3>
            {customer.phone && <SideRow label="Phone" value={customer.phone} />}
            {customer.email && <SideRow label="Email" value={customer.email} />}
            {customer.address && <SideRow label="Address" value={customer.address} />}
            {customer.state && <SideRow label="State" value={customer.state} />}
            {customer.gstin && <SideRow label="GSTIN" value={customer.gstin} mono />}
            {customer.credit_limit != null && <SideRow label="Credit Limit" value={INR(Number(customer.credit_limit))} />}
            {customer.credit_days != null && <SideRow label="Credit Days" value={`${customer.credit_days} days`} />}
            {customer.special_discount_type && (
              <SideRow
                label="Special Discount"
                value={customer.special_discount_type === 'percentage'
                  ? `${customer.special_discount_value}%`
                  : INR(Number(customer.special_discount_value))}
                accent="emerald"
              />
            )}
            {customer.special_discount_label && (
              <SideRow label="Label" value={customer.special_discount_label} />
            )}
          </div>

          {/* Regular medicines */}
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-zinc-900">Regular Medicines</h3>
              <button
                onClick={() => setShowRoutineDialog(true)}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                + Add
              </button>
            </div>
            {routine.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-zinc-400">No routine medicines.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {routine.map((r) => {
                  const overdue = r.days_until_due != null && r.days_until_due < 0;
                  const soon = r.days_until_due != null && r.days_until_due >= 0 && r.days_until_due <= (r.remind_days_before || 3);
                  return (
                    <li key={r.id} className="flex items-center gap-2 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-zinc-900">{r.medicine_name}</div>
                        <div className="text-xs text-zinc-500">
                          Every {r.interval_days ?? '?'} days
                          {r.next_due_date && ` · Due ${fmtDate(r.next_due_date)}`}
                        </div>
                      </div>
                      {(overdue || soon) && (
                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${overdue ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {overdue ? 'Overdue' : 'Due Soon'}
                        </span>
                      )}
                      <button
                        onClick={async () => {
                          await deleteCustomerRoutine(supabase, r.id);
                          setRoutine((prev) => prev.filter((x) => x.id !== r.id));
                        }}
                        className="shrink-0 text-zinc-400 hover:text-red-600"
                        aria-label="Remove"
                      >
                        <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showEditModal && (
        <EditModal
          customer={customer}
          onClose={() => setShowEditModal(false)}
          onSaved={() => { setShowEditModal(false); router.refresh(); }}
        />
      )}
      {showPaymentModal && (
        <PaymentModal
          customer={customer}
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => { setShowPaymentModal(false); router.refresh(); }}
        />
      )}
      {showRoutineDialog && (
        <RoutineDialog
          customerId={customer.id}
          onClose={() => setShowRoutineDialog(false)}
          onAdded={(item) => { setRoutine((prev) => [...prev, item]); setShowRoutineDialog(false); }}
        />
      )}
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerDetail['customer'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone,
    email: customer.email ?? '',
    address: customer.address ?? '',
    state: customer.state ?? '',
    customerType: customer.customer_type as 'b2c' | 'b2b',
    gstin: customer.gstin ?? '',
    creditLimit: String(customer.credit_limit ?? ''),
    creditDays: String(customer.credit_days ?? ''),
    specialDiscountType: customer.special_discount_type ?? '',
    specialDiscountValue: String(customer.special_discount_value ?? 0),
    specialDiscountLabel: customer.special_discount_label ?? '',
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateCustomer(supabase, {
        id: customer.id,
        name: form.name,
        phone: form.phone,
        email: form.email,
        address: form.address,
        state: form.state,
        customerType: form.customerType,
        gstin: form.gstin,
        creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : null,
        creditDays: form.creditDays ? parseInt(form.creditDays, 10) : null,
        specialDiscountType: (form.specialDiscountType as 'percentage' | 'flat' | '') || null,
        specialDiscountValue: parseFloat(form.specialDiscountValue) || 0,
        specialDiscountLabel: form.specialDiscountLabel || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-bold text-zinc-900">Edit Customer</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2 rounded-xl bg-zinc-100 p-1">
            {(['b2c', 'b2b'] as const).map((t) => (
              <button key={t} type="button" onClick={() => set('customerType', t)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${form.customerType === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'}`}>
                {t === 'b2c' ? 'Walk-in (B2C)' : 'Business (B2B)'}
              </button>
            ))}
          </div>

          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Personal Details</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs font-medium text-zinc-600">Name *</label><input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} required /></div>
            <div><label className="mb-1 block text-xs font-medium text-zinc-600">Phone</label><input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} /></div>
            <div><label className="mb-1 block text-xs font-medium text-zinc-600">Email</label><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} /></div>
            {form.customerType === 'b2b' && (
              <div><label className="mb-1 block text-xs font-medium text-zinc-600">GSTIN</label><input value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} className={`${inputCls} uppercase`} maxLength={15} /></div>
            )}
          </div>

          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Address</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs font-medium text-zinc-600">Address</label><input value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} /></div>
            <div><label className="mb-1 block text-xs font-medium text-zinc-600">State</label><input value={form.state} onChange={(e) => set('state', e.target.value)} className={inputCls} /></div>
          </div>

          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Credit Terms</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs font-medium text-zinc-600">Credit Limit (₹)</label><input type="number" value={form.creditLimit} onChange={(e) => set('creditLimit', e.target.value)} className={inputCls} /></div>
            <div><label className="mb-1 block text-xs font-medium text-zinc-600">Credit Days</label><input type="number" value={form.creditDays} onChange={(e) => set('creditDays', e.target.value)} className={inputCls} /></div>
          </div>

          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Special Discount (POS)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Type</label>
              <select value={form.specialDiscountType} onChange={(e) => set('specialDiscountType', e.target.value)} className={inputCls}>
                <option value="">None</option>
                <option value="percentage">Percentage (%)</option>
                <option value="flat">Flat Amount (₹)</option>
              </select>
            </div>
            {form.specialDiscountType && (
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Value</label>
                <input type="number" step="0.01" min="0" value={form.specialDiscountValue} onChange={(e) => set('specialDiscountValue', e.target.value)} className={inputCls} />
              </div>
            )}
          </div>
          {form.specialDiscountType && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Label (printed on bill)</label>
              <input value={form.specialDiscountLabel} onChange={(e) => set('specialDiscountLabel', e.target.value)} placeholder="e.g. Senior citizen, Staff" className={inputCls} />
            </div>
          )}

          {error && <Alert variant="error">{error}</Alert>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

function PaymentModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerDetail['customer'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [amount, setAmount] = useState<number>(Number(customer.outstanding_balance));
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0) { setError('Amount must be greater than 0.'); return; }
    setError(null);
    setSaving(true);
    try {
      await recordCustomerPayment(supabase, {
        customerId: customer.id,
        amount,
        paymentMethod: method,
        notes: notes || undefined,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-bold text-zinc-900">Record Payment</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Outstanding: <span className="font-semibold text-amber-700">₹{Number(customer.outstanding_balance).toFixed(2)}</span>
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Amount (₹)</label>
            <input
              type="number" step="0.01" min="0.01"
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className={inputCls}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Payment Method</label>
            <div className="grid grid-cols-3 gap-1">
              {PAYMENT_METHODS.slice(0, 6).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-lg py-1.5 text-xs font-semibold capitalize ${method === m ? 'bg-emerald-600 text-white' : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'}`}
                >
                  {m.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Receipt number, etc." className={inputCls} />
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Routine Dialog ───────────────────────────────────────────────────────────

function RoutineDialog({
  customerId,
  onClose,
  onAdded,
}: {
  customerId: string;
  onClose: () => void;
  onAdded: (item: CustomerRoutineItem) => void;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ medicine_id: string; name: string }>>([]);
  const [selectedMed, setSelectedMed] = useState<{ id: string; name: string } | null>(null);
  const [intervalDays, setIntervalDays] = useState<number>(30);
  const [remindDays, setRemindDays] = useState<number>(3);
  const [lastDate, setLastDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim() || selectedMed) { setResults([]); return; }
    const t = setTimeout(async () => {
      const rows = await listMedicines(supabase, { search: query, limit: 8 }).catch(() => []);
      setResults(rows.map((r) => ({ medicine_id: r.id, name: r.name })));
    }, 200);
    return () => clearTimeout(t);
  }, [query, selectedMed, supabase]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMed) { setError('Pick a medicine first.'); return; }
    setSaving(true);
    setError(null);
    try {
      const id = await upsertCustomerRoutine(supabase, {
        customerId,
        medicineId: selectedMed.id,
        intervalDays,
        remindDaysBefore: remindDays,
        lastDispensedDate: lastDate || null,
      });
      const nextDue = lastDate ? new Date(new Date(lastDate).getTime() + intervalDays * 86400000).toISOString().slice(0, 10) : null;
      const daysUntil = nextDue ? Math.round((new Date(nextDue).getTime() - Date.now()) / 86400000) : null;
      onAdded({
        id,
        medicine_id: selectedMed.id,
        medicine_name: selectedMed.name,
        sale_unit_mode: 'pack_only',
        units_per_pack: null,
        interval_days: intervalDays,
        remind_days_before: remindDays,
        last_dispensed_date: lastDate || null,
        next_due_date: nextDue,
        days_until_due: daysUntil,
        notes: null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-bold text-zinc-900">Add Regular Medicine</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-zinc-600">Medicine</label>
            {selectedMed ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2">
                <span className="flex-1 text-sm font-medium text-emerald-900">{selectedMed.name}</span>
                <button type="button" onClick={() => { setSelectedMed(null); setQuery(''); }} className="text-emerald-600 hover:text-emerald-800">×</button>
              </div>
            ) : (
              <>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search medicine…"
                  className={inputCls}
                  autoFocus
                />
                {results.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full overflow-y-auto max-h-48 rounded-xl border border-zinc-200 bg-white shadow-lg">
                    {results.map((r) => (
                      <li key={r.medicine_id} onMouseDown={() => { setSelectedMed({ id: r.medicine_id, name: r.name }); setQuery(''); setResults([]); }}
                        className="cursor-pointer px-3 py-2 text-sm hover:bg-emerald-50">{r.name}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="grid gap-3 grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Interval (days)</label>
              <input type="number" min={1} value={intervalDays} onChange={(e) => setIntervalDays(parseInt(e.target.value, 10) || 30)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Remind (days before)</label>
              <input type="number" min={0} value={remindDays} onChange={(e) => setRemindDays(parseInt(e.target.value, 10) || 3)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Last Dispensed Date</label>
            <input type="date" value={lastDate} onChange={(e) => setLastDate(e.target.value)} className={inputCls} />
          </div>

          {error && <Alert variant="error">{error}</Alert>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SideRow({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: 'emerald' }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={`text-right font-medium ${mono ? 'font-mono text-xs' : ''} ${accent === 'emerald' ? 'text-emerald-700' : 'text-zinc-900'}`}>{value}</span>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const cfg = {
    paid: 'bg-emerald-50 text-emerald-700',
    partial: 'bg-blue-50 text-blue-700',
    pending: 'bg-amber-50 text-amber-700',
    credit: 'bg-rose-50 text-rose-700',
  }[status] ?? 'bg-zinc-50 text-zinc-700';
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cfg}`}>
      {status}
    </span>
  );
}
