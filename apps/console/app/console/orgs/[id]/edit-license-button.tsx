'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateOrgLicense,
  listBillingTiers,
  DomainError,
  type OrgDetailOrg,
  type BillingTier,
  type BillingStatus,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Modal } from '../../../../components/ui/modal';
import { Field, Alert } from '../../../../components/form-fields';

const BILLING_OPTIONS: { value: BillingStatus; label: string }[] = [
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past due' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

const DATE_PRESETS = [7, 14, 30, 60, 90];

function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function EditLicenseButton({ org }: { org: OrgDetailOrg }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tiers, setTiers] = useState<BillingTier[] | null>(null);
  const [form, setForm] = useState({
    billing_tier_id: org.billing_tier_id ?? '',
    billing_status: org.billing_status as BillingStatus,
    trial_ends_at: toDateInputValue(org.trial_ends_at),
  });

  function reset() {
    setForm({
      billing_tier_id: org.billing_tier_id ?? '',
      billing_status: org.billing_status as BillingStatus,
      trial_ends_at: toDateInputValue(org.trial_ends_at),
    });
    setError(null);
  }

  async function onOpen() {
    setOpen(true);
    if (!tiers) {
      try {
        const supabase = getSupabaseBrowserClient();
        setTiers(await listBillingTiers(supabase));
      } catch {
        // Tier list is a convenience only — the modal stays usable without it.
      }
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await updateOrgLicense(supabase, org.id, {
        billing_tier_id: form.billing_tier_id || null,
        billing_status: form.billing_status,
        trial_ends_at: form.trial_ends_at || null,
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to update license';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <>
      <Button variant="secondary" size="md" onClick={onOpen}>
        Edit license
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Edit license"
        description="Tier drives real limit/feature enforcement in apps/web. Every change is recorded in the audit log."
        maxWidth="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={loading} type="submit">
              Save changes
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-800">Tier</span>
            <select
              value={form.billing_tier_id}
              onChange={(e) => set('billing_tier_id', e.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm transition-all hover:border-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
            >
              <option value="">No tier (ungoverned)</option>
              {tiers?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-800">Billing status</span>
            <select
              value={form.billing_status}
              onChange={(e) => set('billing_status', e.target.value as BillingStatus)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm transition-all hover:border-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
            >
              {BILLING_OPTIONS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>

          <div>
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {DATE_PRESETS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => set('trial_ends_at', daysFromToday(days))}
                  className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-300 hover:bg-zinc-50"
                >
                  +{days} days
                </button>
              ))}
            </div>
            <Field
              label={form.billing_status === 'trial' ? 'Trial ends' : 'License valid until'}
              type="date"
              value={form.trial_ends_at}
              onChange={(e) => set('trial_ends_at', e.target.value)}
              hint="Leave blank to clear."
            />
          </div>

          {error && <Alert variant="error">{error}</Alert>}
        </form>
      </Modal>
    </>
  );
}
