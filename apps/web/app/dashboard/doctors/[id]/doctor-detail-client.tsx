'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  updateDoctor,
  recordDoctorCommissionPayout,
  getDoctorSales,
  type DoctorDetail,
  type DoctorSaleRow,
  type DoctorCommissionPayout,
  type UpdateDoctorInput,
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

type Tab = 'overview' | 'sales' | 'commission';

const DATE_RANGES: { id: string; label: string; from?: string; to?: string }[] = (() => {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = iso(now);
  const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const last7 = iso(new Date(now.getTime() - 6 * 86400000));
  return [
    { id: 'month', label: 'This Month', from: monthStart, to: today },
    { id: 'week', label: 'Last 7 Days', from: last7, to: today },
    { id: 'all', label: 'All Time' },
  ];
})();

interface Props {
  detail: DoctorDetail;
  initialSales: DoctorSaleRow[];
  payouts: DoctorCommissionPayout[];
}

export function DoctorDetailClient({ detail: initialDetail, initialSales, payouts: initialPayouts }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [detail, setDetail] = useState(initialDetail);
  const [payouts] = useState(initialPayouts);
  const [tab, setTab] = useState<Tab>('overview');
  const [sales, setSales] = useState(initialSales);
  const [salesRange, setSalesRange] = useState('all');
  const [salesLoading, setSalesLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);

  const { doctor, stats } = detail;

  const loadSales = useCallback(async (rangeId: string) => {
    const range = DATE_RANGES.find((r) => r.id === rangeId);
    setSalesLoading(true);
    try {
      const data = await getDoctorSales(supabase, doctor.id, { from: range?.from, to: range?.to });
      setSales(data);
      setSalesRange(rangeId);
    } finally {
      setSalesLoading(false);
    }
  }, [supabase, doctor.id]);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'sales', label: 'Sales' },
    { id: 'commission', label: 'Commission' },
  ];

  return (
    <div className="space-y-5">
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Link href="/dashboard/doctors" className="hover:text-zinc-700">Doctors</Link>
        <span>›</span>
        <span className="text-zinc-700">Dr. {doctor.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-2xl font-black text-indigo-600">
            {doctor.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-black text-zinc-900">Dr. {doctor.name}</h1>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${doctor.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                {doctor.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            {doctor.specialization && <p className="text-sm text-zinc-500">{doctor.specialization}</p>}
            {doctor.clinic_name && <p className="text-xs text-zinc-400">{doctor.clinic_name}{doctor.clinic_address ? ` — ${doctor.clinic_address}` : ''}</p>}
          </div>
        </div>
        <button
          onClick={() => setEditOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Edit
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
                tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Overview ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Total Sales Referred', value: stats.referred_sales_count.toString(), cls: 'text-zinc-900' },
              { label: 'Total Revenue', value: INR(stats.total_revenue), cls: 'text-zinc-900' },
              { label: 'Commission Earned', value: INR(stats.commission_earned), cls: 'text-indigo-700' },
              { label: 'Commission Balance', value: INR(stats.commission_balance), cls: stats.commission_balance > 0 ? 'text-amber-600' : 'text-emerald-700' },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
                <p className={`mt-1 text-2xl font-black tabular-nums ${c.cls}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Doctor identity card */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Doctor Information</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              {[
                { label: 'Name', value: `Dr. ${doctor.name}` },
                { label: 'Specialization', value: doctor.specialization || '—' },
                { label: 'Phone', value: doctor.phone || '—' },
                { label: 'Clinic', value: doctor.clinic_name || '—' },
                { label: 'Address', value: doctor.clinic_address || '—' },
                {
                  label: 'Commission',
                  value: doctor.commission_rate > 0
                    ? (doctor.commission_type === 'percentage' ? `${doctor.commission_rate}% of bill` : `${INR(doctor.commission_rate)} per bill`)
                    : 'No commission',
                },
              ].map((f) => (
                <div key={f.label} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                  <dt className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">{f.label}</dt>
                  <dd className="mt-1 font-semibold text-zinc-800">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {/* ── Tab: Sales ── */}
      {tab === 'sales' && (
        <div className="space-y-4">
          {/* Date range pills */}
          <div className="inline-flex gap-1 rounded-xl bg-zinc-100 p-1">
            {DATE_RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => loadSales(r.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  salesRange === r.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {salesLoading ? (
            <div className="py-12 text-center text-sm text-zinc-400">Loading…</div>
          ) : sales.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <p className="font-semibold text-zinc-700">No sales found</p>
              <p className="text-sm text-zinc-400">No referred sales in the selected period.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">Bill #</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {sales.map((s) => (
                    <tr key={s.sale_id} className="hover:bg-indigo-50/40">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/sales/${s.sale_id}`} className="font-mono font-semibold text-indigo-700 hover:underline">
                          {s.bill_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{fmtDate(s.bill_date)}</td>
                      <td className="px-4 py-3 text-zinc-700">{s.customer_name}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-zinc-900">{INR(s.total_amount)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-indigo-700">{INR(s.commission_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-zinc-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-xs font-bold text-zinc-500">{sales.length} bills</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-zinc-900">
                      {INR(sales.reduce((s, r) => s + Number(r.total_amount), 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700">
                      {INR(sales.reduce((s, r) => s + Number(r.commission_amount), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Commission ── */}
      {tab === 'commission' && (
        <div className="space-y-4">
          {/* Commission summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Earned (Lifetime)', value: INR(stats.commission_earned), cls: 'text-indigo-700' },
              { label: 'Paid Out', value: INR(stats.commission_paid), cls: 'text-emerald-700' },
              { label: 'Balance Pending', value: INR(stats.commission_balance), cls: stats.commission_balance > 0 ? 'text-amber-600' : 'text-zinc-500' },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
                <p className={`mt-1 text-2xl font-black tabular-nums ${c.cls}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Formula explainer */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            Commission rate:{' '}
            {doctor.commission_rate > 0
              ? doctor.commission_type === 'percentage'
                ? `${doctor.commission_rate}% of each referred bill total`
                : `${INR(doctor.commission_rate)} per referred bill`
              : 'No commission configured'}
          </div>

          {/* Record payout button */}
          {stats.commission_balance > 0 && (
            <button
              onClick={() => setPayoutOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Record Payout
            </button>
          )}

          {/* Payout history */}
          {payouts.length === 0 ? (
            <p className="text-sm text-zinc-400">No payouts recorded yet.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-400">
                Payout History
              </div>
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Notes</th>
                    <th className="px-4 py-3">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {payouts.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 text-zinc-600">{fmtDateTime(p.paid_at)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700">{INR(p.amount)}</td>
                      <td className="px-4 py-3 text-zinc-600">{p.notes || '—'}</td>
                      <td className="px-4 py-3 text-zinc-500">{p.paid_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      <EditDoctorModal
        open={editOpen}
        doctor={doctor}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => {
          setDetail((d) => ({ ...d, doctor: updated }));
          setEditOpen(false);
        }}
      />

      {/* Record Payout Modal */}
      <RecordPayoutModal
        open={payoutOpen}
        doctorId={doctor.id}
        balance={stats.commission_balance}
        onClose={() => setPayoutOpen(false)}
        onSaved={(result) => {
          setPayoutOpen(false);
          setDetail((d) => ({
            ...d,
            stats: { ...d.stats, commission_paid: result.commission_paid, commission_balance: result.commission_balance },
          }));
          router.refresh();
        }}
      />
    </div>
  );
}

function EditDoctorModal({
  open, doctor, onClose, onSaved,
}: {
  open: boolean;
  doctor: DoctorDetail['doctor'];
  onClose: () => void;
  onSaved: (d: DoctorDetail['doctor']) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<UpdateDoctorInput & { commission_type: 'percentage' | 'fixed'; commission_rate: number; is_active: boolean }>({
    name: doctor.name,
    specialization: doctor.specialization ?? '',
    phone: doctor.phone ?? '',
    clinic_name: doctor.clinic_name ?? '',
    clinic_address: doctor.clinic_address ?? '',
    commission_type: doctor.commission_type,
    commission_rate: doctor.commission_rate,
    is_active: doctor.is_active,
  });

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const updated = await updateDoctor(getSupabaseBrowserClient(), doctor.id, form);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof DomainError ? err.message : err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Doctor" maxWidth="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={loading}>Save changes</Button></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} required />
          <Field label="Specialization" value={form.specialization ?? ''} onChange={(e) => set('specialization', e.target.value)} placeholder="MBBS, MD" />
          <Field label="Phone" type="tel" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          <Field label="Clinic name" value={form.clinic_name ?? ''} onChange={(e) => set('clinic_name', e.target.value)} />
        </div>
        <Field label="Clinic address" value={form.clinic_address ?? ''} onChange={(e) => set('clinic_address', e.target.value)} />

        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Commission</p>
          <div className="flex gap-2">
            {(['percentage', 'fixed'] as const).map((t) => (
              <button key={t} type="button" onClick={() => set('commission_type', t)}
                className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition-all ${form.commission_type === t ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-zinc-200 bg-white text-zinc-600'}`}>
                {t === 'percentage' ? '% of bill' : '₹ per bill'}
              </button>
            ))}
          </div>
          <Field label={form.commission_type === 'percentage' ? 'Rate (%)' : 'Rate (₹ / bill)'}
            type="number" value={String(form.commission_rate)} onChange={(e) => set('commission_rate', Number(e.target.value))} min="0" step="0.1" />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500" />
          <span className="text-sm font-medium text-zinc-700">Active</span>
        </label>

        {error && <Alert variant="error">{error}</Alert>}
      </form>
    </Modal>
  );
}

function RecordPayoutModal({
  open, doctorId, balance, onClose, onSaved,
}: {
  open: boolean;
  doctorId: string;
  balance: number;
  onClose: () => void;
  onSaved: (result: { commission_paid: number; commission_balance: number }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount.'); return; }
    setLoading(true);
    try {
      const result = await recordDoctorCommissionPayout(getSupabaseBrowserClient(), {
        doctor_id: doctorId, amount: amt, notes: notes.trim() || undefined,
      });
      onSaved(result as unknown as { commission_paid: number; commission_balance: number });
    } catch (err) {
      setError(err instanceof DomainError ? err.message : err instanceof Error ? err.message : 'Failed to record payout');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record Commission Payout" maxWidth="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={loading}>Record Payout</Button></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-zinc-500">
          Balance pending: <span className="font-bold text-amber-600">{INR(balance)}</span>
        </p>
        <Field label="Amount (₹)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required min="0.01" step="0.01" />
        <Field label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment reference, method, etc." />
        {error && <Alert variant="error">{error}</Alert>}
      </form>
    </Modal>
  );
}
