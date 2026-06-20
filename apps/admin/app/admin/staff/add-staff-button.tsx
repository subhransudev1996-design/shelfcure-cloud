'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createStaff, DomainError, type StaffRole } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { Field, Alert } from '../../../components/form-fields';

type CreatableRole = Exclude<StaffRole, 'super_admin'>;

interface StoreOption {
  id: string;
  code: string;
  name: string;
}

interface Props {
  stores: StoreOption[];
  canCreateAdmins: boolean; // true for super_admin; store_admin can only make pharmacist/cashier
}

export function AddStaffButton({ stores, canCreateAdmins }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role: 'pharmacist' as CreatableRole,
    store_id: stores[0]?.id ?? '',
  });

  function reset() {
    setForm({
      full_name: '',
      email: '',
      password: '',
      phone: '',
      role: 'pharmacist',
      store_id: stores[0]?.id ?? '',
    });
    setError(null);
    setShowPassword(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.role !== 'accountant' && !form.store_id) {
      setError('Pick a store for this staff member.');
      return;
    }
    if (stores.length === 0 && form.role !== 'accountant') {
      setError('Create a store first before adding store-scoped staff.');
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await createStaff(supabase, {
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        phone: form.phone || null,
        role: form.role,
        store_id: form.role === 'accountant' ? null : form.store_id,
      });
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to add staff';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function generatePassword() {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const random = new Uint32Array(12);
    crypto.getRandomValues(random);
    let pw = '';
    for (const n of random) pw += charset[n % charset.length];
    set('password', pw);
    setShowPassword(true);
  }

  const showStorePicker = form.role !== 'accountant';
  const roleOptions: Array<{ value: CreatableRole; label: string; hint: string; restricted?: boolean }> = [
    { value: 'store_admin', label: 'Store admin', hint: 'Full control of one store', restricted: !canCreateAdmins },
    { value: 'pharmacist', label: 'Pharmacist', hint: 'Can sell and manage inventory' },
    { value: 'cashier', label: 'Cashier', hint: 'POS only' },
    { value: 'accountant', label: 'Accountant', hint: 'Read-only across all stores', restricted: !canCreateAdmins },
  ];

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
        Add staff
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Add a staff member"
        description="They will sign in at the dashboard using the email and password you set here."
        maxWidth="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={loading} type="submit">
              Create staff
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Role picker */}
          <div>
            <div className="mb-1.5 text-sm font-medium text-zinc-800">Role</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {roleOptions.map((r) => {
                const active = form.role === r.value;
                const disabled = r.restricted;
                return (
                  <button
                    key={r.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => set('role', r.value)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                      active
                        ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <div className="text-sm font-medium text-zinc-900">{r.label}</div>
                    <div className="text-xs text-zinc-500">
                      {disabled ? 'Only the organization owner can create this role' : r.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Full name"
              placeholder="e.g. Priya Sharma"
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              required
              minLength={2}
              maxLength={120}
            />
            <Field
              label="Phone (optional)"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+91 9000000000"
              type="tel"
            />
            <Field
              label="Email"
              placeholder="staff@example.com"
              value={form.email}
              onChange={(e) => set('email', e.target.value.toLowerCase())}
              required
              type="email"
              autoComplete="off"
              hint="They will sign in with this email."
            />
            <Field
              label="Temporary password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              required
              minLength={8}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              hint="Share securely. They can change it after first login."
              trailing={
                <div className="flex items-center gap-2 text-xs font-normal">
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="text-zinc-500 hover:text-zinc-800"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="text-emerald-700 hover:text-emerald-800"
                  >
                    Generate
                  </button>
                </div>
              }
            />
          </div>

          {showStorePicker && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-zinc-800">Assigned store</span>
              <select
                value={form.store_id}
                onChange={(e) => set('store_id', e.target.value)}
                required
                className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm transition-all hover:border-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
              >
                {stores.length === 0 ? (
                  <option value="">No stores yet — create one first</option>
                ) : (
                  stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))
                )}
              </select>
              <p className="mt-1.5 text-xs text-zinc-500">
                This staff member will only see and operate on this store.
              </p>
            </label>
          )}

          {error && <Alert variant="error">{error}</Alert>}
        </form>
      </Modal>
    </>
  );
}
