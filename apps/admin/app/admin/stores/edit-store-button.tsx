'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateStoreSettings, DomainError, type Store } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { Field, Alert } from '../../../components/form-fields';

// `select('*')` returns these columns at runtime even though the generated
// Store type (stale relative to the live schema) omits them.
type StoreRowExtra = Store & {
  enable_gst_calculation?: boolean;
  near_expiry_alert_days?: number;
  low_stock_threshold?: number;
};

export function EditStoreButton({ store }: { store: StoreRowExtra }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: store.name ?? '',
    gstin: store.gstin ?? '',
    drug_license_no: store.drug_license_no ?? '',
    address: store.address ?? '',
    city: store.city ?? '',
    state: store.state ?? '',
    pincode: store.pincode ?? '',
    phone: store.phone ?? '',
    email: store.email ?? '',
    owner_name: store.owner_name ?? '',
    gst_scheme: (store.gst_scheme ?? 'regular') as 'regular' | 'composition' | 'unregistered',
    gst_filing_type: (store.gst_filing_type ?? 'monthly') as 'monthly' | 'quarterly',
    idle_lock_minutes: Number(store.idle_lock_minutes ?? 10),
    is_active: store.is_active ?? true,
    enable_gst_calculation: store.enable_gst_calculation ?? true,
    upi_vpa: store.upi_vpa ?? '',
    near_expiry_alert_days: Number(store.near_expiry_alert_days ?? 30),
    low_stock_threshold: Number(store.low_stock_threshold ?? 10),
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await updateStoreSettings(supabase, store.id, form);
      setOpen(false);
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to save store';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${store.code}`}
        description="Per-store details printed on bills and used for GST."
        maxWidth="xl"
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
              <span className="font-medium text-zinc-900">Store active</span>
              <span className="block text-xs text-zinc-500">
                Disabling hides this store from staff and blocks new sales.
              </span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Store name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
            <Field label="Owner name" value={form.owner_name} onChange={(e) => set('owner_name', e.target.value)} />
            <Field
              label="GSTIN"
              value={form.gstin}
              onChange={(e) => set('gstin', e.target.value.toUpperCase())}
              maxLength={15}
              hint="Leave blank to inherit org GSTIN."
            />
            <Field
              label="Drug license #"
              value={form.drug_license_no}
              onChange={(e) => set('drug_license_no', e.target.value)}
              placeholder="20B / 21B / ..."
            />
            <Field label="Phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            <Field label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            <Field label="City" value={form.city} onChange={(e) => set('city', e.target.value)} />
            <Field
              label="State"
              value={form.state}
              onChange={(e) => set('state', e.target.value)}
              hint="Used to decide intra vs inter-state GST."
            />
            <Field label="Pincode" value={form.pincode} onChange={(e) => set('pincode', e.target.value)} maxLength={6} />
            <Field label="Address" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="GST scheme"
              value={form.gst_scheme}
              onChange={(v) => set('gst_scheme', v as typeof form.gst_scheme)}
              options={[
                { value: 'regular', label: 'Regular' },
                { value: 'composition', label: 'Composition' },
                { value: 'unregistered', label: 'Unregistered' },
              ]}
            />
            <Select
              label="Filing type"
              value={form.gst_filing_type}
              onChange={(v) => set('gst_filing_type', v as typeof form.gst_filing_type)}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly (QRMP)' },
              ]}
            />
            <Field
              label="Idle lock (minutes)"
              type="number"
              min={0}
              max={120}
              value={form.idle_lock_minutes}
              onChange={(e) => set('idle_lock_minutes', parseInt(e.target.value, 10) || 0)}
              hint="0 disables auto-lock."
            />
          </div>

          <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-teal-700">GST configuration</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.enable_gst_calculation}
                  onChange={(e) => set('enable_gst_calculation', e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm">
                  <span className="font-medium text-zinc-900">Enable GST calculation</span>
                  <span className="block text-xs text-zinc-500">
                    When off, bills show no GST line regardless of scheme.
                  </span>
                </span>
              </label>
              <Field
                label="UPI ID"
                value={form.upi_vpa}
                onChange={(e) => set('upi_vpa', e.target.value)}
                placeholder="store@upi"
                hint="Renders a scannable UPI QR on printed bills. Leave blank to use the org default."
              />
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-amber-700">Alert thresholds</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Near expiry alert (days)"
                type="number"
                min={1}
                max={365}
                value={form.near_expiry_alert_days}
                onChange={(e) => set('near_expiry_alert_days', parseInt(e.target.value, 10) || 0)}
                hint="Batches expiring within this many days are flagged."
              />
              <Field
                label="Low stock threshold"
                type="number"
                min={0}
                value={form.low_stock_threshold}
                onChange={(e) => set('low_stock_threshold', parseInt(e.target.value, 10) || 0)}
                hint="Default minimum stock level for medicines without their own setting."
              />
            </div>
          </div>

          {error && <Alert variant="error">{error}</Alert>}
        </form>
      </Modal>
    </>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-zinc-800">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm transition-all hover:border-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
