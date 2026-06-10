'use client';

import { useEffect, useMemo, useState } from 'react';
import { createCustomer, type Customer } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Modal } from '../../../../components/ui/modal';
import { Button } from '../../../../components/ui/button';
import { Field, Alert } from '../../../../components/form-fields';

interface Props {
  open: boolean;
  storeId: string;
  onClose: () => void;
  onCreated: (c: Customer) => void;
}

/**
 * Lightweight customer create modal opened from POS (Ctrl+Shift+N).
 * Matches desktop's "Quick Add Customer" — name + phone + type + optional GSTIN.
 * Full customer master lives in /dashboard/customers.
 */
export function QuickAddCustomerModal({ open, storeId, onClose, onCreated }: Props) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [form, setForm] = useState({ name: '', phone: '', type: 'b2c' as 'b2c' | 'b2b', gstin: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setForm({ name: '', phone: '', type: 'b2c', gstin: '' }); setError(null); }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setError(null); setSaving(true);
    try {
      const c = await createCustomer(supabase, {
        storeId,
        name: form.name,
        phone: form.phone || undefined,
        customerType: form.type,
        gstin: form.type === 'b2b' ? (form.gstin || undefined) : undefined,
      });
      onCreated(c);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create customer');
    } finally { setSaving(false); }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quick add customer"
      description="Save name + phone now. Edit full details later in /dashboard/customers."
      maxWidth="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving} disabled={!form.name.trim()}>Add customer</Button>
      </>}
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name" required autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Field label="Phone" type="tel" inputMode="numeric" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-800">Customer type</label>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-zinc-50 p-1">
            {(['b2c', 'b2b'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, type: t }))}
                className={`rounded-md px-2 py-1.5 text-xs font-bold transition ${form.type === t ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-500 hover:text-zinc-700'}`}
              >{t === 'b2c' ? 'B2C' : 'B2B / GSTIN'}</button>
            ))}
          </div>
        </div>
        {form.type === 'b2b' && (
          <Field label="GSTIN" maxLength={15} value={form.gstin}
            onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))}
            className="font-mono uppercase"
          />
        )}
        {error && <Alert variant="error">{error}</Alert>}
      </form>
    </Modal>
  );
}
