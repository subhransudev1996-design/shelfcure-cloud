'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createOrgWithOwner,
  listBillingTiers,
  DomainError,
  type BillingTier,
  type BillingCycle,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { Field, Alert } from '../../../components/form-fields';

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const TRIAL_PRESETS = [7, 14, 30, 60, 90];

const PAYMENT_METHOD_OPTIONS: { value: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque'; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
];

export function CreateOrgButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tiers, setTiers] = useState<BillingTier[] | null>(null);
  const [form, setForm] = useState({
    org_name: '',
    owner_full_name: '',
    owner_email: '',
    owner_phone: '',
    owner_password: '',
    licenseMode: 'trial' as 'trial' | 'paid',
    billing_tier_id: '',
    trial_days: 14,
    billing_cycle: 'monthly' as BillingCycle,
    amount_rupees: '',
    payment_method: 'cash' as 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque',
    notes: '',
  });

  function reset() {
    setForm({
      org_name: '',
      owner_full_name: '',
      owner_email: '',
      owner_phone: '',
      owner_password: '',
      licenseMode: 'trial',
      billing_tier_id: '',
      trial_days: 14,
      billing_cycle: 'monthly',
      amount_rupees: '',
      payment_method: 'cash',
      notes: '',
    });
    setError(null);
  }

  async function onOpen() {
    setOpen(true);
    if (!tiers) {
      try {
        const supabase = getSupabaseBrowserClient();
        const data = await listBillingTiers(supabase);
        setTiers(data.filter((t) => t.is_active));
      } catch {
        // Tier prefill is a convenience only — the modal stays usable without it.
      }
    }
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function selectTier(tierId: string) {
    const tier = tiers?.find((t) => t.id === tierId);
    setForm((f) => ({
      ...f,
      billing_tier_id: tierId,
      trial_days: tier ? tier.trial_days : f.trial_days,
      amount_rupees: tier
        ? String(
            (f.billing_cycle === 'yearly' ? tier.yearly_price_paise : tier.monthly_price_paise) ??
              Number(f.amount_rupees) * 100,
          ).length
          ? amountFromTier(tier, f.billing_cycle, f.amount_rupees)
          : f.amount_rupees
        : f.amount_rupees,
    }));
  }

  function amountFromTier(tier: BillingTier, cycle: BillingCycle, fallback: string): string {
    const paise = cycle === 'yearly' ? tier.yearly_price_paise : tier.monthly_price_paise;
    return paise != null ? String(paise / 100) : fallback;
  }

  function selectCycle(cycle: BillingCycle) {
    const tier = tiers?.find((t) => t.id === form.billing_tier_id);
    setForm((f) => ({
      ...f,
      billing_cycle: cycle,
      amount_rupees: tier ? amountFromTier(tier, cycle, f.amount_rupees) : f.amount_rupees,
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await createOrgWithOwner(supabase, {
        org_name: form.org_name,
        owner_full_name: form.owner_full_name,
        owner_email: form.owner_email,
        owner_password: form.owner_password,
        owner_phone: form.owner_phone,
        license:
          form.licenseMode === 'trial'
            ? { mode: 'trial', billing_tier_id: form.billing_tier_id || null, trial_days: form.trial_days }
            : {
                mode: 'paid',
                billing_tier_id: form.billing_tier_id,
                billing_cycle: form.billing_cycle,
                amount_paise: Math.round(Number(form.amount_rupees) * 100),
                payment_method: form.payment_method,
                notes: form.notes || null,
              },
      });
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to create organization';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        size="md"
        onClick={onOpen}
        leadingIcon={
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
          </svg>
        }
      >
        Create organization
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Create an organization"
        description="For sales-assisted onboarding — the owner gets full access immediately, no email confirmation needed."
        maxWidth="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={loading} type="submit">
              Create organization
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Organization name"
            value={form.org_name}
            onChange={(e) => set('org_name', e.target.value)}
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. Sharma Medicals Group"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Owner full name"
              value={form.owner_full_name}
              onChange={(e) => set('owner_full_name', e.target.value)}
              required
              minLength={2}
              maxLength={120}
              placeholder="e.g. Anjali Sharma"
            />
            <Field
              label="Owner phone (optional)"
              value={form.owner_phone}
              onChange={(e) => set('owner_phone', e.target.value)}
              placeholder="+91 9000000000"
              type="tel"
            />
          </div>

          <Field
            label="Owner email"
            type="email"
            value={form.owner_email}
            onChange={(e) => set('owner_email', e.target.value)}
            required
            placeholder="anjali@pharmacy.com"
          />

          <Field
            label="Owner's initial password"
            value={form.owner_password}
            onChange={(e) => set('owner_password', e.target.value)}
            required
            minLength={8}
            placeholder="At least 8 characters"
            trailing={
              <button
                type="button"
                onClick={() => set('owner_password', generatePassword())}
                className="text-xs font-medium text-indigo-700 hover:text-indigo-800"
              >
                Generate
              </button>
            }
            hint="Share this with the owner out-of-band. They can sign in immediately."
          />

          <div className="rounded-xl border border-zinc-200 p-3.5">
            <span className="mb-2 block text-sm font-medium text-zinc-800">License</span>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => set('licenseMode', 'trial')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                  form.licenseMode === 'trial'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                Start on trial
              </button>
              <button
                type="button"
                onClick={() => set('licenseMode', 'paid')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                  form.licenseMode === 'paid'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                Activate paid license now
              </button>
            </div>

            <label className="mb-3 block">
              <span className="mb-1.5 block text-sm font-medium text-zinc-800">Tier</span>
              <select
                value={form.billing_tier_id}
                onChange={(e) => selectTier(e.target.value)}
                required={form.licenseMode === 'paid'}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
              >
                {form.licenseMode === 'trial' && <option value="">No tier (ungoverned)</option>}
                {!tiers && <option value="">Loading tiers…</option>}
                {tiers?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            {form.licenseMode === 'trial' ? (
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {TRIAL_PRESETS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => set('trial_days', days)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                        form.trial_days === days
                          ? 'bg-indigo-600 text-white ring-indigo-600'
                          : 'bg-white text-zinc-600 ring-zinc-300 hover:bg-zinc-50'
                      }`}
                    >
                      {days} days
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <Field
                    label="Custom (days)"
                    type="number"
                    min={0}
                    value={String(form.trial_days)}
                    onChange={(e) => set('trial_days', Number(e.target.value))}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-zinc-800">Billing cycle</span>
                  <select
                    value={form.billing_cycle}
                    onChange={(e) => selectCycle(e.target.value as BillingCycle)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Amount paid (₹)"
                    type="number"
                    min={1}
                    step="0.01"
                    value={form.amount_rupees}
                    onChange={(e) => set('amount_rupees', e.target.value)}
                    required={form.licenseMode === 'paid'}
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
              </div>
            )}
          </div>

          {error && <Alert variant="error">{error}</Alert>}
        </form>
      </Modal>
    </>
  );
}
