'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateStaff, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { Alert } from '../../../components/form-fields';

export function RemoveStaffButton({
  staffId,
  fullName,
  isActive,
}: {
  staffId: string;
  fullName: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await updateStaff(supabase, staffId, { is_active: !isActive });
      setOpen(false);
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to update staff member';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant={isActive ? 'danger' : 'secondary'} size="sm" onClick={() => setOpen(true)}>
        {isActive ? 'Remove' : 'Reactivate'}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isActive ? `Remove ${fullName}?` : `Reactivate ${fullName}?`}
        description={
          isActive
            ? `${fullName} will no longer be able to sign in. Their name stays on past sales, purchases, and other records — this does not delete any history, and can be undone any time from here.`
            : `${fullName} will be able to sign in again.`
        }
        maxWidth="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant={isActive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
              {isActive ? 'Remove' : 'Reactivate'}
            </Button>
          </>
        }
      >
        {error && <Alert variant="error">{error}</Alert>}
      </Modal>
    </>
  );
}
