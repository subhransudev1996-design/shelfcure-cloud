'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateBillingTier, DomainError, type BillingTier } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Alert } from '../../../../components/form-fields';
import { TierFormFields, tierFormToPayload, type TierFormState } from '../tier-form-fields';

function toForm(tier: BillingTier): TierFormState {
  return {
    name: tier.name,
    slug: tier.slug,
    description: tier.description,
    is_active: tier.is_active,
    is_default: tier.is_default,
    trial_days: String(tier.trial_days),
    monthly_price_rupees: tier.monthly_price_paise == null ? '' : String(tier.monthly_price_paise / 100),
    yearly_price_rupees: tier.yearly_price_paise == null ? '' : String(tier.yearly_price_paise / 100),
    max_stores: tier.max_stores == null ? '' : String(tier.max_stores),
    max_staff: tier.max_staff == null ? '' : String(tier.max_staff),
    features: tier.features,
  };
}

export function EditTierForm({ tier }: { tier: BillingTier }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TierFormState>(() => toForm(tier));

  function set<K extends keyof TierFormState>(k: K, v: TierFormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await updateBillingTier(supabase, tier.id, tierFormToPayload(form));
      router.push('/console/tiers');
      router.refresh();
    } catch (e) {
      const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to update tier';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <TierFormFields form={form} set={set} showSlugOverride />
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={loading}>
          Save changes
        </Button>
        <Button variant="ghost" type="button" onClick={() => router.push('/console/tiers')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
