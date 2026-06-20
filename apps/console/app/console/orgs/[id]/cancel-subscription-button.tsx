'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelSubscription, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Modal } from '../../../../components/ui/modal';
import { Alert } from '../../../../components/form-fields';

export function CancelSubscriptionButton({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await cancelSubscription(supabase, orgId);
      setOpen(false);
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to cancel subscription';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Cancel subscription
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel subscription"
        description="This cancels the subscription in Razorpay immediately and marks the org's billing status as cancelled."
        maxWidth="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep subscription
            </Button>
            <Button variant="danger" onClick={onConfirm} loading={loading}>
              Cancel it
            </Button>
          </>
        }
      >
        {error && <Alert variant="error">{error}</Alert>}
      </Modal>
    </>
  );
}
