'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setOrgSuspended, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Modal } from '../../../../components/ui/modal';
import { Alert } from '../../../../components/form-fields';

export function SuspendOrgButton({ orgId, isSuspended }: { orgId: string; isSuspended: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await setOrgSuspended(supabase, orgId, !isSuspended);
      setOpen(false);
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to update suspension';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant={isSuspended ? 'secondary' : 'danger'} size="sm" onClick={() => setOpen(true)}>
        {isSuspended ? 'Unsuspend' : 'Suspend subscription'}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isSuspended ? 'Unsuspend this organization?' : 'Suspend this organization?'}
        description={
          isSuspended
            ? "Staff will be able to sign in to apps/web and apps/admin again. Billing status is unaffected."
            : 'Every staff member will be blocked from signing in to apps/web and apps/admin starting now. Anyone already signed in keeps working until they sign out — this only blocks future sign-ins. Billing status is unaffected; you can unsuspend at any time.'
        }
        maxWidth="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant={isSuspended ? 'primary' : 'danger'} onClick={onConfirm} loading={loading}>
              {isSuspended ? 'Unsuspend' : 'Suspend'}
            </Button>
          </>
        }
      >
        {error && <Alert variant="error">{error}</Alert>}
      </Modal>
    </>
  );
}
