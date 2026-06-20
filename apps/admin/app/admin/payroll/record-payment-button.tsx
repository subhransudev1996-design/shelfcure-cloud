'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  recordSalaryPayment,
  DomainError,
  EXPENSE_PAYMENT_METHODS,
  type StaffRow,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { Field, Alert } from '../../../components/form-fields';

interface StoreOption {
  id: string;
  code: string;
  name: string;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function RecordPaymentButton({ staff, stores }: { staff: StaffRow; stores: StoreOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientUuid] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({
    amount: staff.monthly_salary != null ? String(staff.monthly_salary) : '',
    payment_date: todayIso(),
    payment_method: 'bank_transfer' as (typeof EXPENSE_PAYMENT_METHODS)[number],
    notes: '',
    store_id: staff.store_id ?? '',
  });

  const needsStorePicker = staff.store_id == null;

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (needsStorePicker && !form.store_id) {
      setError('Pick which store this expense should be charged to.');
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await recordSalaryPayment(supabase, {
        user_profile_id: staff.id,
        amount,
        payment_date: form.payment_date,
        store_id: needsStorePicker ? form.store_id : null,
        payment_method: form.payment_method,
        notes: form.notes || null,
        clientUuid,
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to record payment';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Record payment
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Pay ${staff.full_name}`}
        description="Recorded as a Salaries expense for the relevant store — Finance stays in sync."
        maxWidth="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={loading} type="submit">
              Record payment
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Amount (₹)"
              type="number"
              min={0.01}
              step="0.01"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
              required
            />
            <Field
              label="Payment date"
              type="date"
              value={form.payment_date}
              onChange={(e) => set('payment_date', e.target.value)}
              required
            />
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-800">Payment method</span>
            <select
              value={form.payment_method}
              onChange={(e) => set('payment_method', e.target.value as typeof form.payment_method)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm transition-all hover:border-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
            >
              {EXPENSE_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </label>

          {needsStorePicker && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-zinc-800">Charge to store</span>
              <select
                value={form.store_id}
                onChange={(e) => set('store_id', e.target.value)}
                required
                className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm transition-all hover:border-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
              >
                <option value="">Select a store…</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-zinc-500">
                {staff.full_name} isn&apos;t assigned to a single store, so pick which store&apos;s
                books should absorb this expense.
              </p>
            </label>
          )}

          <Field
            label="Notes (optional)"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="e.g. June 2026 salary"
          />

          {error && <Alert variant="error">{error}</Alert>}
        </form>
      </Modal>
    </>
  );
}
