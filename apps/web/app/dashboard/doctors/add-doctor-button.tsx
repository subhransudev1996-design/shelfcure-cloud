'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createDoctor, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { Field, Alert } from '../../../components/form-fields';

export function AddDoctorButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    specialization: '',
    phone: '',
    clinic_name: '',
    clinic_address: '',
  });

  function reset() {
    setForm({ name: '', specialization: '', phone: '', clinic_name: '', clinic_address: '' });
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createDoctor(getSupabaseBrowserClient(), form);
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to add doctor';
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
        Add doctor
      </Button>

      <Modal
        open={open}
        onClose={() => { setOpen(false); reset(); }}
        title="Add a doctor"
        description="A prescriber whose scripts you fulfil."
        maxWidth="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={onSubmit} loading={loading} type="submit">Create doctor</Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Doctor name"
              placeholder="e.g. Anil Sharma"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              minLength={2}
              maxLength={200}
              hint="No need to include 'Dr.' — we add it automatically."
            />
            <Field
              label="Specialization"
              value={form.specialization}
              onChange={(e) => set('specialization', e.target.value)}
              placeholder="MBBS, MD (Medicine)"
            />
            <Field
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+91 9000000000"
            />
            <Field
              label="Clinic name"
              value={form.clinic_name}
              onChange={(e) => set('clinic_name', e.target.value)}
              placeholder="HealthFirst Clinic"
            />
          </div>
          <Field
            label="Clinic address (optional)"
            value={form.clinic_address}
            onChange={(e) => set('clinic_address', e.target.value)}
            placeholder="Street, area, landmark"
          />
          {error && <Alert variant="error">{error}</Alert>}
        </form>
      </Modal>
    </>
  );
}
