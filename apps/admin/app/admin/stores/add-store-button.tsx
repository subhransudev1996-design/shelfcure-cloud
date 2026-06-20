'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createStore, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { Field, Alert } from '../../../components/form-fields';

export function AddStoreButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    gstin: '',
    drug_license_no: '',
  });

  function reset() {
    setForm({ code: '', name: '', city: '', state: '', pincode: '', phone: '', gstin: '', drug_license_no: '' });
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await createStore(supabase, form);
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to add store';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <>
      <Button
        size="md"
        onClick={() => setOpen(true)}
        leadingIcon={
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
          </svg>
        }
      >
        Add store
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Add a store"
        description="A store is one physical pharmacy outlet under your organization."
        maxWidth="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={loading} type="submit">
              Create store
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Store code"
              placeholder="e.g. MUM01"
              value={form.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              required
              maxLength={6}
              hint="2–6 letters/digits. Used on bills and reports."
            />
            <Field
              label="Store name"
              placeholder="e.g. Sharma Medicals Andheri"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              minLength={2}
              maxLength={120}
            />
            <Field
              label="City"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder="Mumbai"
            />
            <Field
              label="State"
              value={form.state}
              onChange={(e) => set('state', e.target.value)}
              placeholder="Maharashtra"
            />
            <Field
              label="Pincode"
              value={form.pincode}
              onChange={(e) => set('pincode', e.target.value)}
              placeholder="400001"
              maxLength={6}
              inputMode="numeric"
            />
            <Field
              label="Phone"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+91 9000000000"
              type="tel"
            />
            <Field
              label="GSTIN (optional)"
              value={form.gstin}
              onChange={(e) => set('gstin', e.target.value.toUpperCase())}
              placeholder="27AAACS1234A1Z5"
              maxLength={15}
              hint="Leave blank to inherit org GSTIN."
            />
            <Field
              label="Drug License # (optional)"
              value={form.drug_license_no}
              onChange={(e) => set('drug_license_no', e.target.value)}
              placeholder="20B/21B/..."
            />
          </div>
          {error && <Alert variant="error">{error}</Alert>}
        </form>
      </Modal>
    </>
  );
}
