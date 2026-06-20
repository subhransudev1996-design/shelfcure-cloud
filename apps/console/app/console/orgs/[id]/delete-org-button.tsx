'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteOrganization, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Modal } from '../../../../components/ui/modal';
import { Field, Alert } from '../../../../components/form-fields';

export function DeleteOrgButton({ orgId, orgName }: { orgId: string; orgName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setConfirmText('');
    setError(null);
  }

  async function onConfirm() {
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await deleteOrganization(supabase, orgId, confirmText);
      router.push('/console/orgs');
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to delete organization';
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Delete organization
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Delete this organization?"
        description="This permanently deletes every store, sale, purchase, medicine, customer, staff account, and invoice belonging to this organization. There is no undo and no recovery — the data is gone."
        maxWidth="sm"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={onConfirm}
              loading={loading}
              disabled={confirmText.trim() !== orgName}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Type <span className="font-mono font-semibold text-zinc-900">{orgName}</span> to confirm.
          </p>
          <Field
            label="Organization name"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={orgName}
            autoComplete="off"
          />
          {error && <Alert variant="error">{error}</Alert>}
        </div>
      </Modal>
    </>
  );
}
