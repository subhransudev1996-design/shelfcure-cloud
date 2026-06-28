'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMasterMedicineConsole, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { Alert } from '../../../components/form-fields';

export function DeleteMedicineButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await deleteMasterMedicineConsole(supabase, id);
      setOpen(false);
      router.refresh();
    } catch (e) {
      const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to delete medicine';
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
        title={`Delete ${name}?`}
        description="Removes this medicine from the shared catalog — it will no longer be suggested in any store's Add Medicine autocomplete. This cannot be undone."
        maxWidth="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onConfirm} loading={loading} variant="danger">
              Delete medicine
            </Button>
          </>
        }
      >
        {error && <Alert variant="error">{error}</Alert>}
      </Modal>
    </>
  );
}
