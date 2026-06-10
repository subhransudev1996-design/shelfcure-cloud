'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateOrgSettings,
  updateStoreSettings,
  updateMyProfile,
  DomainError,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Field, Alert } from '../../../components/form-fields';

type Tab = 'organization' | 'store' | 'profile';

interface Props {
  role: string;
  // Loosely typed — they come from raw selects and we only read displayable fields.
  org: Record<string, any> | null;
  store: Record<string, any> | null;
  profile: Record<string, any> | null;
}

export function SettingsClient({ role, org, store, profile }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [tab, setTab] = useState<Tab>(
    role === 'super_admin' ? 'organization' : store ? 'store' : 'profile',
  );

  const canEditOrg = role === 'super_admin';
  const canEditStore = role === 'super_admin' || role === 'store_admin';

  return (
    <>
      <div className="mb-4 flex gap-1 rounded-2xl border border-zinc-200 bg-white p-1 shadow-sm">
        {([
          { id: 'organization', label: 'Organization', show: true },
          { id: 'store', label: 'Store', show: !!store },
          { id: 'profile', label: 'My profile', show: true },
        ] as Array<{ id: Tab; label: string; show: boolean }>)
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                tab === t.id
                  ? 'bg-emerald-50 text-emerald-800 shadow-sm'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === 'organization' && (
        <OrgPanel
          canEdit={canEditOrg}
          initial={org}
          onSave={async (input) => {
            await updateOrgSettings(supabase, input);
            router.refresh();
          }}
        />
      )}
      {tab === 'store' && store && (
        <StorePanel
          canEdit={canEditStore}
          initial={store}
          onSave={async (input) => {
            await updateStoreSettings(supabase, store.id, input);
            router.refresh();
          }}
        />
      )}
      {tab === 'profile' && profile && (
        <ProfilePanel
          initial={profile}
          onSave={async (input) => {
            await updateMyProfile(supabase, input);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

// ============================================================================
// Organization panel
// ============================================================================

function OrgPanel({
  canEdit,
  initial,
  onSave,
}: {
  canEdit: boolean;
  initial: any;
  onSave: (input: any) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    legal_name: initial?.legal_name ?? '',
    gstin_default: initial?.gstin_default ?? '',
    shared_masters_enabled: !!initial?.shared_masters_enabled,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      await onSave(form);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <SectionHeader title="Organization" subtitle={canEdit ? 'Visible on every bill and report.' : 'Read-only — only the org owner can edit.'} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Display name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          disabled={!canEdit}
          required
        />
        <Field
          label="Legal name"
          value={form.legal_name ?? ''}
          onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
          disabled={!canEdit}
          placeholder="As per GST registration"
        />
        <Field
          label="Default GSTIN"
          value={form.gstin_default ?? ''}
          onChange={(e) => setForm({ ...form, gstin_default: e.target.value.toUpperCase() })}
          disabled={!canEdit}
          maxLength={15}
          placeholder="27AAACS1234A1Z5"
          hint="Stores inherit this when they don't specify their own."
        />
        <div className="flex items-end">
          <ReadOnlyBox label="Plan" value={cap(initial?.plan_tier ?? '—')} />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={form.shared_masters_enabled}
            onChange={(e) => setForm({ ...form, shared_masters_enabled: e.target.checked })}
            disabled={!canEdit}
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm">
            <span className="font-medium text-zinc-900">Shared masters across stores</span>
            <span className="block text-xs text-zinc-500">
              When enabled, medicines, suppliers, and customers can live at the org level and be visible to every store. Per-store overrides still work. (ADR-0002)
            </span>
          </span>
        </label>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">Settings saved.</Alert>}

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>Save changes</Button>
        </div>
      )}
    </form>
  );
}

// ============================================================================
// Store panel
// ============================================================================

function StorePanel({
  canEdit,
  initial,
  onSave,
}: {
  canEdit: boolean;
  initial: any;
  onSave: (input: any) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: initial.name ?? '',
    gstin: initial.gstin ?? '',
    drug_license_no: initial.drug_license_no ?? '',
    address: initial.address ?? '',
    city: initial.city ?? '',
    state: initial.state ?? '',
    pincode: initial.pincode ?? '',
    phone: initial.phone ?? '',
    email: initial.email ?? '',
    owner_name: initial.owner_name ?? '',
    gst_scheme: (initial.gst_scheme ?? 'regular') as 'regular' | 'composition' | 'unregistered',
    gst_filing_type: (initial.gst_filing_type ?? 'monthly') as 'monthly' | 'quarterly',
    idle_lock_minutes: Number(initial.idle_lock_minutes ?? 10),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      await onSave(form);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <SectionHeader
        title={
          <>
            Store · <span className="font-mono text-emerald-700">{initial.code}</span>
          </>
        }
        subtitle={canEdit ? 'Per-store details printed on bills and used for GST.' : 'Read-only — ask the org owner to update.'}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Store name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canEdit} required />
        <Field label="Owner name" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} disabled={!canEdit} />
        <Field label="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} disabled={!canEdit} maxLength={15} hint="Leave blank to inherit org GSTIN." />
        <Field label="Drug license #" value={form.drug_license_no} onChange={(e) => setForm({ ...form, drug_license_no: e.target.value })} disabled={!canEdit} placeholder="20B / 21B / ..." />
        <Field label="Phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!canEdit} />
        <Field label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!canEdit} />
        <Field label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} disabled={!canEdit} />
        <Field label="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} disabled={!canEdit} hint="Used to decide intra vs inter-state GST." />
        <Field label="Pincode" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} disabled={!canEdit} maxLength={6} />
        <Field label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={!canEdit} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          label="GST scheme"
          value={form.gst_scheme}
          onChange={(v) => setForm({ ...form, gst_scheme: v as any })}
          disabled={!canEdit}
          options={[
            { value: 'regular', label: 'Regular' },
            { value: 'composition', label: 'Composition' },
            { value: 'unregistered', label: 'Unregistered' },
          ]}
        />
        <Select
          label="Filing type"
          value={form.gst_filing_type}
          onChange={(v) => setForm({ ...form, gst_filing_type: v as any })}
          disabled={!canEdit}
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
          onChange={(e) => setForm({ ...form, idle_lock_minutes: parseInt(e.target.value, 10) || 0 })}
          disabled={!canEdit}
          hint="0 disables auto-lock."
        />
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">Store settings saved.</Alert>}

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>Save changes</Button>
        </div>
      )}
    </form>
  );
}

// ============================================================================
// Profile panel
// ============================================================================

function ProfilePanel({
  initial,
  onSave,
}: {
  initial: any;
  onSave: (input: any) => Promise<void>;
}) {
  const [form, setForm] = useState({
    full_name: initial.full_name ?? '',
    phone: initial.phone ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      await onSave(form);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <SectionHeader title="My profile" subtitle="How you appear to teammates and on bill receipts." />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
        <Field label="Phone" type="tel" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <ReadOnlyBox label="Email" value={initial.email} />
        <ReadOnlyBox label="Role" value={cap((initial.role ?? '').replace('_', ' '))} />
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">Profile updated.</Alert>}

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>Save changes</Button>
      </div>
    </form>
  );
}

// ============================================================================
// Small helpers
// ============================================================================

function SectionHeader({ title, subtitle }: { title: React.ReactNode; subtitle?: string }) {
  return (
    <div className="border-b border-zinc-100 pb-3">
      <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
    </div>
  );
}

function ReadOnlyBox({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-zinc-800">{label}</span>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[15px] text-zinc-700">
        {value || '—'}
      </div>
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-zinc-800">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm transition-all hover:border-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15 disabled:cursor-not-allowed disabled:bg-zinc-100"
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

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
