'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPlatformAdmin, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { Field, Alert } from '../../../components/form-fields';

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function AddPlatformAdminButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });

  function reset() {
    setForm({ full_name: '', email: '', password: '' });
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await createPlatformAdmin(supabase, form);
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to add platform admin';
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
        Add platform admin
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Add a platform admin"
        description="They'll get full access to this Console — every organization, every license. There are no internal tiers in v1."
        maxWidth="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={loading} type="submit">
              Create platform admin
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Full name"
            value={form.full_name}
            onChange={(e) => set('full_name', e.target.value)}
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. Priya Nair"
          />
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            required
            placeholder="priya@shelfcure.com"
          />
          <Field
            label="Temporary password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            required
            minLength={8}
            placeholder="At least 8 characters"
            trailing={
              <button
                type="button"
                onClick={() => set('password', generatePassword())}
                className="text-xs font-medium text-indigo-700 hover:text-indigo-800"
              >
                Generate
              </button>
            }
            hint="Share this with them out-of-band. They can sign in immediately."
          />
          {error && <Alert variant="error">{error}</Alert>}
        </form>
      </Modal>
    </>
  );
}
