'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateStaff, DomainError, type StaffRow, type StaffRole } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { Field, Alert } from '../../../components/form-fields';

type EditableRole = Exclude<StaffRole, 'super_admin'>;

interface StoreOption {
  id: string;
  code: string;
  name: string;
}

const ROLE_OPTIONS: Array<{ value: EditableRole; label: string; hint: string }> = [
  { value: 'store_admin', label: 'Store admin', hint: 'Full control of one store' },
  { value: 'pharmacist', label: 'Pharmacist', hint: 'Can sell and manage inventory' },
  { value: 'cashier', label: 'Cashier', hint: 'POS only' },
  { value: 'accountant', label: 'Accountant', hint: 'Read-only across all stores' },
];

export function EditStaffButton({ staff, stores }: { staff: StaffRow; stores: StoreOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: staff.full_name,
    phone: staff.phone ?? '',
    role: staff.role as EditableRole,
    store_id: staff.store_id ?? '',
    is_active: staff.is_active,
    monthly_salary: staff.monthly_salary != null ? String(staff.monthly_salary) : '',
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.role !== 'accountant' && !form.store_id) {
      setError('Pick a store for this role.');
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await updateStaff(supabase, staff.id, {
        full_name: form.full_name,
        phone: form.phone || null,
        role: form.role,
        store_id: form.role === 'accountant' ? null : form.store_id,
        is_active: form.is_active,
        monthly_salary: form.monthly_salary.trim() === '' ? null : Number(form.monthly_salary),
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to save staff';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const showStorePicker = form.role !== 'accountant';

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${staff.full_name}`}
        description={staff.email}
        maxWidth="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={loading} type="submit">
              Save changes
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set('is_active', e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm">
              <span className="font-medium text-zinc-900">Active</span>
              <span className="block text-xs text-zinc-500">
                Deactivated staff are flagged across the dashboard. Sign-in is not yet blocked for
                deactivated accounts.
              </span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Full name"
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              required
              minLength={2}
              maxLength={120}
            />
            <Field
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+91 9000000000"
            />
            <Field
              label="Monthly salary (₹)"
              type="number"
              min={0}
              step="0.01"
              value={form.monthly_salary}
              onChange={(e) => set('monthly_salary', e.target.value)}
              placeholder="Not set"
              hint="Used to pre-fill the amount when recording a payment on the Payroll page."
            />
          </div>

          <div>
            <div className="mb-1.5 text-sm font-medium text-zinc-800">Role</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLE_OPTIONS.map((r) => {
                const active = form.role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => set('role', r.value)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                      active
                        ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <div className="text-sm font-medium text-zinc-900">{r.label}</div>
                    <div className="text-xs text-zinc-500">{r.hint}</div>
                  </button>
                );
              })}
            </div>
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
                  <option value="">No stores yet</option>
                ) : (
                  stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))
                )}
              </select>
            </label>
          )}

          {error && <Alert variant="error">{error}</Alert>}
        </form>
      </Modal>
    </>
  );
}
