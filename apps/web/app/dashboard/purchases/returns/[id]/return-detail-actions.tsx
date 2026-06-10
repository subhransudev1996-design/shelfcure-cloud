'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deletePurchaseReturn, updatePurchaseReturn, DomainError, type PurchaseReturnDetailItem } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../../lib/supabase/client';
import { Button } from '../../../../../components/ui/button';
import { Modal } from '../../../../../components/ui/modal';
import { Alert } from '../../../../../components/form-fields';

interface Props {
  returnId: string;
  returnNumber: string;
  reason: string | null;
  items: PurchaseReturnDetailItem[];
}

function fmtINR(n: number) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ReturnDetailActions({ returnId, returnNumber, reason, items }: Props) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reasonInput, setReasonInput] = useState(reason ?? '');
  const [amounts, setAmounts] = useState<Record<string, string>>(
    () => Object.fromEntries(items.map((it) => [it.id, String(it.amount)])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePrint() {
    window.print();
  }

  async function handleSaveEdit() {
    setSaving(true);
    setError(null);
    try {
      await updatePurchaseReturn(supabase, {
        id: returnId,
        reason: reasonInput || null,
        items: items.map((it) => ({ id: it.id, amount: Number(amounts[it.id]) || 0 })),
      });
      setEditOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to update return');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      await deletePurchaseReturn(supabase, returnId);
      router.push('/dashboard/purchases/returns');
      router.refresh();
    } catch (e) {
      setError(e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to delete return');
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" size="sm" onClick={handlePrint}>Print</Button>
        <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>Edit</Button>
        <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>Delete</Button>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit return ${returnNumber}`}
        maxWidth="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveEdit} loading={saving}>Save changes</Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">Reason</label>
            <input
              type="text"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Item amounts</div>
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-700">{it.medicine_name ?? 'Unknown medicine'}</span>
                <input
                  type="number"
                  step="0.01"
                  value={amounts[it.id] ?? ''}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [it.id]: e.target.value }))}
                  className="w-28 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right font-mono text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>
            ))}
            <div className="flex justify-between border-t border-zinc-100 pt-2 text-sm font-semibold text-zinc-900">
              <span>New total</span>
              <span className="font-mono">
                {fmtINR(items.reduce((s, it) => s + (Number(amounts[it.id]) || 0), 0))}
              </span>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete return ${returnNumber}?`}
        description="This reverses the stock and supplier ledger changes made by this return. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} loading={saving}>Delete return</Button>
          </>
        }
      >
        {error && <Alert variant="error">{error}</Alert>}
      </Modal>
    </>
  );
}
