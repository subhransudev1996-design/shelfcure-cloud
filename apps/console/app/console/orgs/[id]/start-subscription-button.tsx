'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createSubscription,
  listBillingTiers,
  DomainError,
  type BillingTier,
  type BillingCycle,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Modal } from '../../../../components/ui/modal';
import { Alert } from '../../../../components/form-fields';

function formatRupees(paise: number | null, cycle: BillingCycle): string {
  if (paise == null) return 'Contact sales';
  return `₹${(paise / 100).toLocaleString('en-IN')}/${cycle === 'yearly' ? 'yr' : 'mo'}`;
}

export function StartSubscriptionButton({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tiers, setTiers] = useState<BillingTier[] | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [tierId, setTierId] = useState<string>('');
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onOpen() {
    setOpen(true);
    setError(null);
    setShortUrl(null);
    if (!tiers) {
      try {
        const supabase = getSupabaseBrowserClient();
        const data = await listBillingTiers(supabase);
        setTiers(data);
        const firstPurchasable = data.find((t) => t.razorpay_plan_id_monthly);
        if (firstPurchasable) setTierId(firstPurchasable.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load tiers');
      }
    }
  }

  function close() {
    setOpen(false);
    setError(null);
    setShortUrl(null);
    setCopied(false);
  }

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const result = await createSubscription(supabase, orgId, tierId, cycle);
      setShortUrl(result.short_url);
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to start subscription';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function copyUrl() {
    if (!shortUrl) return;
    await navigator.clipboard.writeText(shortUrl);
    setCopied(true);
  }

  const purchasableTiers =
    tiers?.filter((t) => (cycle === 'yearly' ? t.razorpay_plan_id_yearly : t.razorpay_plan_id_monthly)) ?? [];
  const selectedTier = purchasableTiers.find((t) => t.id === tierId);

  return (
    <>
      <Button size="md" onClick={onOpen}>
        Start subscription
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={shortUrl ? 'Subscription created' : 'Start a subscription'}
        description={
          shortUrl
            ? 'Share this checkout link with the org owner — it is only shown once.'
            : 'Creates a real Razorpay subscription. The org owner completes payment via a hosted checkout link.'
        }
        maxWidth="md"
        footer={
          shortUrl ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button onClick={onSubmit} loading={loading} disabled={!selectedTier}>
                Create subscription
              </Button>
            </>
          )
        }
      >
        {shortUrl ? (
          <div className="space-y-3">
            <div className="break-all rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-700">
              {shortUrl}
            </div>
            <Button variant="secondary" size="sm" onClick={copyUrl}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        ) : !tiers ? (
          <p className="text-sm text-zinc-500">Loading tiers…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCycle('monthly')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                  cycle === 'monthly' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setCycle('yearly')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                  cycle === 'yearly' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                Yearly
              </button>
            </div>

            {purchasableTiers.length === 0 && (
              <Alert variant="info">
                No Razorpay {cycle} plans are configured yet — run the plan setup script first.
              </Alert>
            )}
            {purchasableTiers.map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2.5 ${
                  tierId === t.id ? 'border-indigo-500 ring-2 ring-indigo-500/15' : 'border-zinc-300'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <input type="radio" name="billing_tier" checked={tierId === t.id} onChange={() => setTierId(t.id)} />
                  <span className="text-sm font-medium text-zinc-900">{t.name}</span>
                </span>
                <span className="text-sm text-zinc-600">
                  {formatRupees(cycle === 'yearly' ? t.yearly_price_paise : t.monthly_price_paise, cycle)}
                </span>
              </label>
            ))}
            {error && <Alert variant="error">{error}</Alert>}
          </div>
        )}
      </Modal>
    </>
  );
}
