'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  updateSupplier,
  recordSupplierPayment,
  type SupplierDetail,
  type SupplierLedgerEntry,
  type UpdateSupplierInput,
  DomainError,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Modal } from '../../../../components/ui/modal';
import { Button } from '../../../../components/ui/button';
import { Field, Alert } from '../../../../components/form-fields';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

const LEDGER_TYPE_COLOR: Record<string, string> = {
  purchase:   'text-red-700 bg-red-50',
  payment:    'text-emerald-700 bg-emerald-50',
  return:     'text-blue-700 bg-blue-50',
  adjustment: 'text-zinc-700 bg-zinc-50',
};

const STATUS_CHIP: Record<string, string> = {
  paid:    'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  partial: 'bg-blue-100 text-blue-700',
};

const PAYMENT_METHODS = ['cash', 'upi', 'card', 'neft', 'rtgs', 'cheque', 'bank_transfer'];

interface Props {
  detail: SupplierDetail;
  ledger: SupplierLedgerEntry[];
}

export function SupplierDetailClient({ detail: initialDetail, ledger: initialLedger }: Props) {
  const router = useRouter();

  const [detail, setDetail] = useState(initialDetail);
  const [ledger] = useState(initialLedger);
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const { supplier, quick_stats, recent_purchases } = detail;
  const balance = Number(supplier.outstanding_balance ?? 0);

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Link href="/dashboard/suppliers" className="hover:text-zinc-700">Suppliers</Link>
        <span>›</span>
        <span className="text-zinc-700">{supplier.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-zinc-900">{supplier.name}</h1>
          {supplier.city && <p className="text-sm text-zinc-500">{[supplier.city, supplier.state].filter(Boolean).join(', ')}</p>}
        </div>
        <div className="flex gap-2">
          {balance > 0 && (
            <button onClick={() => setPaymentOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700">
              Record Payment
            </button>
          )}
          <button onClick={() => setEditOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
            Edit
          </button>
        </div>
      </div>

      {/* 2-col grid: main (2/3) + sidebar (1/3) */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Sidebar */}
        <div className="space-y-4 lg:order-last">
          {/* Balance card */}
          <div className={`rounded-2xl border p-5 shadow-sm ${balance > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-100 bg-emerald-50'}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Outstanding Payable</p>
            <p className={`mt-1 text-4xl font-black tabular-nums ${balance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {INR(balance)}
            </p>
            {balance === 0 && <p className="mt-1 text-xs text-emerald-600">Fully settled</p>}
          </div>

          {/* Quick stats */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Inventory</p>
            <div className="space-y-2">
              {[
                { label: 'Batches', value: quick_stats.batch_count },
                { label: 'Low Stock', value: quick_stats.low_stock_count, cls: quick_stats.low_stock_count > 0 ? 'text-amber-600' : '' },
                { label: 'Expiry Soon', value: quick_stats.expiry_soon_count, cls: quick_stats.expiry_soon_count > 0 ? 'text-orange-600' : '' },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">{s.label}</span>
                  <span className={`font-bold ${s.cls ?? 'text-zinc-800'}`}>{s.value}</span>
                </div>
              ))}
            </div>
            <Link href={`/dashboard/suppliers/${supplier.id}/medicines`}
              className="mt-3 flex h-9 w-full items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-700 hover:bg-indigo-100">
              View All Medicines →
            </Link>
          </div>

          {/* Contact */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Contact</p>
            <dl className="space-y-2 text-sm">
              {[
                { label: 'Contact', value: supplier.contact_person || '—' },
                { label: 'Phone', value: supplier.phone || '—' },
                { label: 'Email', value: supplier.email || '—' },
                { label: 'GSTIN', value: supplier.gstin || '—' },
                { label: 'Address', value: supplier.address || '—' },
                { label: 'Credit Limit', value: supplier.credit_limit ? INR(Number(supplier.credit_limit)) : '—' },
                { label: 'Credit Days', value: supplier.credit_days ? `${supplier.credit_days} days` : '—' },
              ].map((f) => (
                <div key={f.label} className="flex gap-2">
                  <dt className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-400">{f.label}</dt>
                  <dd className="min-w-0 break-words text-zinc-700">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Main column */}
        <div className="space-y-4 lg:col-span-2">
          {/* Recent Purchases */}
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h3 className="font-bold text-zinc-800">Recent Purchases</h3>
              <Link href={`/dashboard/purchases?supplier=${supplier.id}`}
                className="text-xs text-indigo-600 hover:underline">View all</Link>
            </div>
            {recent_purchases.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-zinc-400">No purchases yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-4 py-2">Bill #</th>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Items</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {recent_purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-indigo-50/40">
                      <td className="px-4 py-2">
                        <Link href={`/dashboard/purchases/${p.id}`}
                          className="font-mono font-semibold text-indigo-700 hover:underline">{p.bill_number}</Link>
                      </td>
                      <td className="px-4 py-2 text-zinc-600">{fmtDate(p.bill_date)}</td>
                      <td className="px-4 py-2 text-zinc-600">{p.items_count}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-zinc-900">{INR(p.total_amount)}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_CHIP[p.payment_status] ?? 'bg-zinc-100 text-zinc-600'}`}>
                          {p.payment_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Ledger */}
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h3 className="font-bold text-zinc-800">Ledger</h3>
              <button onClick={() => window.print()}
                className="text-xs text-zinc-500 hover:text-zinc-700">🖨 Print Statement</button>
            </div>
            {ledger.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-zinc-400">No ledger entries yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Notes</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {ledger.map((e) => (
                    <tr key={e.id} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-2 text-xs text-zinc-500">{fmtDateTime(e.created_at)}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${LEDGER_TYPE_COLOR[e.transaction_type] ?? 'bg-zinc-100 text-zinc-600'}`}>
                          {e.transaction_type}
                        </span>
                        {e.payment_method && <span className="ml-1 text-[10px] text-zinc-400">via {e.payment_method}</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-zinc-500 max-w-[200px] truncate">
                        {e.reference_type === 'purchase_return' && e.reference_id ? (
                          <Link href={`/dashboard/purchases/returns/${e.reference_id}`}
                            className="text-blue-600 hover:underline">
                            {e.notes || 'Return'}
                          </Link>
                        ) : (e.notes || '—')}
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-zinc-800">{INR(e.amount)}</td>
                      <td className="px-4 py-2 text-right font-mono text-sm text-zinc-600">{INR(e.balance_after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <EditSupplierModal
        open={editOpen}
        supplier={supplier}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => {
          setDetail((d) => ({ ...d, supplier: { ...d.supplier, ...updated } }));
          setEditOpen(false);
        }}
      />

      {/* Payment Modal */}
      <RecordPaymentModal
        open={paymentOpen}
        supplierId={supplier.id}
        balance={balance}
        onClose={() => setPaymentOpen(false)}
        onSaved={(newBalance) => {
          setPaymentOpen(false);
          setDetail((d) => ({ ...d, supplier: { ...d.supplier, outstanding_balance: newBalance } }));
          router.refresh();
        }}
      />
    </div>
  );
}

function EditSupplierModal({
  open, supplier, onClose, onSaved,
}: {
  open: boolean;
  supplier: SupplierDetail['supplier'];
  onClose: () => void;
  onSaved: (updated: Partial<SupplierDetail['supplier']>) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<UpdateSupplierInput>({
    name: supplier.name,
    contact_person: supplier.contact_person ?? '',
    phone: supplier.phone ?? '',
    email: supplier.email ?? '',
    gstin: supplier.gstin ?? '',
    city: supplier.city ?? '',
    state: supplier.state ?? '',
    pincode: supplier.pincode ?? '',
    address: supplier.address ?? '',
    credit_limit: supplier.credit_limit ?? undefined,
    credit_days: supplier.credit_days ?? undefined,
  });

  function set<K extends keyof UpdateSupplierInput>(k: K, v: UpdateSupplierInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await updateSupplier(getSupabaseBrowserClient(), supplier.id, form);
      onSaved(form);
    } catch (err) {
      setError(err instanceof DomainError ? err.message : err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Supplier" maxWidth="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={loading}>Save changes</Button></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier name" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} required />
          <Field label="Contact person" value={form.contact_person ?? ''} onChange={(e) => set('contact_person', e.target.value)} />
          <Field label="Phone" type="tel" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          <Field label="Email" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          <Field label="GSTIN" value={form.gstin ?? ''} onChange={(e) => set('gstin', e.target.value.toUpperCase())} maxLength={15} />
          <Field label="Pincode" value={form.pincode ?? ''} onChange={(e) => set('pincode', e.target.value)} maxLength={6} />
          <Field label="City" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
          <Field label="State" value={form.state ?? ''} onChange={(e) => set('state', e.target.value)} />
        </div>
        <Field label="Address" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Credit Terms</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Credit limit (₹)" type="number"
              value={form.credit_limit != null ? String(form.credit_limit) : ''}
              onChange={(e) => set('credit_limit', e.target.value ? Number(e.target.value) : undefined)} min="0" />
            <Field label="Credit days" type="number"
              value={form.credit_days != null ? String(form.credit_days) : ''}
              onChange={(e) => set('credit_days', e.target.value ? Number(e.target.value) : undefined)} min="0" step="1" />
          </div>
        </div>
        {error && <Alert variant="error">{error}</Alert>}
      </form>
    </Modal>
  );
}

function RecordPaymentModal({
  open, supplierId, balance, onClose, onSaved,
}: {
  open: boolean;
  supplierId: string;
  balance: number;
  onClose: () => void;
  onSaved: (newBalance: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount.'); return; }
    setLoading(true);
    try {
      const result = await recordSupplierPayment(getSupabaseBrowserClient(), {
        supplier_id: supplierId, amount: amt, payment_method: method, notes: notes.trim() || undefined,
      });
      onSaved(result.new_balance);
    } catch (err) {
      setError(err instanceof DomainError ? err.message : err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record Supplier Payment" maxWidth="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={loading}>Record Payment</Button></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-zinc-500">
          Outstanding balance: <span className="font-bold text-amber-600">{INR(balance)}</span>
        </p>
        <Field label="Amount (₹)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required min="0.01" step="0.01" />
        <div className="space-y-1">
          <p className="text-xs font-semibold text-zinc-600">Payment method</p>
          <div className="grid grid-cols-4 gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={`rounded-lg border py-1.5 text-xs font-semibold uppercase transition-all ${method === m ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'}`}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <Field label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Transaction ID, bank reference, etc." />
        {error && <Alert variant="error">{error}</Alert>}
      </form>
    </Modal>
  );
}
