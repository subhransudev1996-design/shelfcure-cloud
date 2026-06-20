'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteBillingTier, DomainError, type BillingTier } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { Alert } from '../../../components/form-fields';

export function DeleteTierButton({ tier }: { tier: BillingTier }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await deleteBillingTier(supabase, tier.id);
      setOpen(false);
      router.refresh();
    } catch (e) {
      const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to delete tier';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Delete
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${tier.name}?`}
        description="This cannot be undone."
        maxWidth="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onConfirm} loading={loading} variant="danger">
              Delete tier
            </Button>
          </>
        }
      >
        {tier.org_count > 0 ? (
          <Alert variant="info">
            {tier.org_count} organization(s) are on this tier — deletion will be blocked until they&apos;re
            reassigned or this tier is deactivated instead.
          </Alert>
        ) : (
          <p className="text-sm text-zinc-600">No organizations are on this tier — safe to delete.</p>
        )}
        {error && (
          <div className="mt-3">
            <Alert variant="error">{error}</Alert>
          </div>
        )}
      </Modal>
    </>
  );
}
