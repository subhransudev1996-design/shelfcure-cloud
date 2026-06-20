'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  recordManualPayment,
  listBillingTiers,
  DomainError,
  type BillingTier,
  type BillingCycle,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Modal } from '../../../../components/ui/modal';
import { Field, Alert } from '../../../../components/form-fields';

const PAYMENT_METHOD_OPTIONS: { value: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque'; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
];

export function RecordManualPaymentButton({
  orgId,
  currentBillingTierId,
}: {
  orgId: string;
  currentBillingTierId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tiers, setTiers] = useState<BillingTier[] | null>(null);
  const [form, setForm] = useState({
    billing_tier_id: currentBillingTierId ?? '',
    billing_cycle: 'monthly' as BillingCycle,
    amount_rupees: '',
    payment_method: 'cash' as 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque',
    notes: '',
  });

  async function onOpen() {
    setOpen(true);
    setError(null);
    if (!tiers) {
      try {
        const supabase = getSupabaseBrowserClient();
        setTiers(await listBillingTiers(supabase));
      } catch {
        // Tier prefill is a convenience only.
      }
    }
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function selectTier(tierId: string, cycle: BillingCycle) {
    const tier = tiers?.find((t) => t.id === tierId);
    const price = tier ? (cycle === 'yearly' ? tier.yearly_price_paise : tier.monthly_price_paise) : null;
    setForm((f) => ({
      ...f,
      billing_tier_id: tierId,
      billing_cycle: cycle,
      amount_rupees: price != null ? String(price / 100) : f.amount_rupees,
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await recordManualPayment(supabase, orgId, {
        billing_tier_id: form.billing_tier_id,
        billing_cycle: form.billing_cycle,
        amount_paise: Math.round(Number(form.amount_rupees) * 100),
        payment_method: form.payment_method,
        notes: form.notes || null,
      });
      close();
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
      <Button variant="secondary" size="md" onClick={onOpen}>
        Record manual payment
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Record a manual payment"
        description="For cash/UPI/card/bank/cheque payments collected in person — no Razorpay involved. Activates the license immediately."
        maxWidth="md"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={loading} type="submit">
              Activate license
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-zinc-800">Tier</span>
              <select
                value={form.billing_tier_id}
                onChange={(e) => selectTier(e.target.value, form.billing_cycle)}
                required
                className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
              >
                <option value="" disabled>
                  Select a tier
                </option>
                {tiers?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-zinc-800">Billing cycle</span>
              <select
                value={form.billing_cycle}
                onChange={(e) => selectTier(form.billing_tier_id, e.target.value as BillingCycle)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Amount paid (₹)"
              type="number"
              min={1}
              step="0.01"
              value={form.amount_rupees}
              onChange={(e) => set('amount_rupees', e.target.value)}
              required
              placeholder="e.g. 999"
            />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-zinc-800">Payment method</span>
              <select
                value={form.payment_method}
                onChange={(e) => set('payment_method', e.target.value as typeof form.payment_method)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
              >
                {PAYMENT_METHOD_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Field
            label="Notes (optional)"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="e.g. Collected by field rep Rahul"
          />

          {error && <Alert variant="error">{error}</Alert>}
        </form>
      </Modal>
    </>
  );
}
