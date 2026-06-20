'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBillingTier, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { PageHeader } from '../../../../components/ui/page-header';
import { Alert } from '../../../../components/form-fields';
import { TierFormFields, tierFormToPayload, EMPTY_TIER_FORM, type TierFormState } from '../tier-form-fields';

export default function NewTierPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TierFormState>(EMPTY_TIER_FORM);

  function set<K extends keyof TierFormState>(k: K, v: TierFormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const tier = await createBillingTier(supabase, tierFormToPayload(form));
      router.push(`/console/tiers/${tier.id}`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to create tier';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-4">
        <Link href="/console/tiers" className="text-sm font-medium text-zinc-500 hover:text-zinc-800">
          ← Back to tiers
        </Link>
      </div>

      <PageHeader
        eyebrow="Billing"
        title="Create a billing tier"
        description="Pricing, trial length, limits, and features — everything an org on this tier gets."
      />

      <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <TierFormFields form={form} set={set} showSlugOverride />
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="flex items-center gap-2">
          <Button type="submit" loading={loading}>
            Create tier
          </Button>
          <Button variant="ghost" type="button" onClick={() => router.push('/console/tiers')}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
