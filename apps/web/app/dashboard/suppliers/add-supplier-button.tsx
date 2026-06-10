'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupplier, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { Field, Alert } from '../../../components/form-fields';

export function AddSupplierButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    gstin: '',
    city: '',
    state: '',
    pincode: '',
    address: '',
  });

  function reset() {
    setForm({ name: '', contact_person: '', phone: '', email: '', gstin: '', city: '', state: '', pincode: '', address: '' });
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createSupplier(getSupabaseBrowserClient(), form);
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to add supplier';
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
        Add supplier
      </Button>

      <Modal
        open={open}
        onClose={() => { setOpen(false); reset(); }}
        title="Add a supplier"
        description="A distributor or vendor you buy medicines from."
        maxWidth="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={onSubmit} loading={loading} type="submit">Create supplier</Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Supplier name"
              placeholder="e.g. Sun Pharma Distributors"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              minLength={2}
              maxLength={200}
            />
            <Field
              label="Contact person"
              value={form.contact_person}
              onChange={(e) => set('contact_person', e.target.value)}
              placeholder="e.g. Rajesh Kumar"
            />
            <Field
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+91 9000000000"
            />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="orders@supplier.com"
            />
            <Field
              label="GSTIN (optional)"
              value={form.gstin}
              onChange={(e) => set('gstin', e.target.value.toUpperCase())}
              placeholder="27AAACS1234A1Z5"
              maxLength={15}
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
          </div>
          <Field
            label="Address (optional)"
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Street, area, landmark"
          />
          {error && <Alert variant="error">{error}</Alert>}
        </form>
      </Modal>
    </>
  );
}
