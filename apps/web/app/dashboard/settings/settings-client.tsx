'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  updateOrgSettings,
  updateStoreSettings,
  updateMyProfile,
  posGetHotkeyGroups,
  DomainError,
  type PosHotkeyGroup,
} from '@shelfcure/api-client';
import { shortcutsByCategory, type ShortcutDef } from '@shelfcure/hotkeys';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Field, Alert } from '../../../components/form-fields';
import { HotkeyManagerModal } from '../sales/new/phase-c-features';

type Tab = 'organization' | 'store' | 'hotkeys' | 'shortcuts' | 'team' | 'profile';

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
          { id: 'hotkeys', label: 'POS Hotkeys', show: !!store },
          { id: 'shortcuts', label: 'Shortcuts', show: true },
          { id: 'team', label: 'Users & Roles', show: true },
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
      {tab === 'hotkeys' && store && <HotkeysPanel storeId={store.id} />}
      {tab === 'shortcuts' && <ShortcutsPanel />}
      {tab === 'team' && <TeamPanel />}
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
    upi_id: initial?.upi_id ?? '',
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
        <Field
          label="Default UPI ID"
          value={form.upi_id ?? ''}
          onChange={(e) => setForm({ ...form, upi_id: e.target.value })}
          disabled={!canEdit}
          placeholder="pharmacy@upi"
          hint="Used for the UPI QR on bills when a store doesn't set its own."
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
    enable_gst_calculation: initial.enable_gst_calculation ?? true,
    upi_id: initial.upi_id ?? '',
    logo_url: initial.logo_url ?? '',
    near_expiry_alert_days: Number(initial.near_expiry_alert_days ?? 30),
    low_stock_threshold: Number(initial.low_stock_threshold ?? 10),
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

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

  async function handleLogoUpload(file: File) {
    setError(null);
    setUploadingLogo(true);
    try {
      if (file.size > 500 * 1024) throw new Error('Logo must be under 500 KB.');
      const { data: orgRow } = await supabase.from('stores').select('org_id').eq('id', initial.id).single();
      const orgId = orgRow?.org_id;
      if (!orgId) throw new Error('Could not resolve organization.');
      const ext = file.name.split('.').pop() || 'png';
      const path = `${orgId}/${initial.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('store-logos').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from('store-logos').getPublicUrl(path);
      setForm((f) => ({ ...f, logo_url: pub.publicUrl }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Logo upload failed');
    } finally {
      setUploadingLogo(false);
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

      {/* Logo uploader */}
      <div className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {form.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logo_url} alt="Store logo" className="h-full w-full object-contain" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-zinc-300"><path d="M3 16l5-5 4 4 5-5 4 4M3 7h18v14H3V7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-zinc-800">Store logo</p>
          <p className="text-xs text-zinc-500">Shown in the sidebar header and on printed bills. Max 500 KB.</p>
          {canEdit && (
            <label className="mt-2 inline-block cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
              {uploadingLogo ? 'Uploading…' : 'Upload logo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                disabled={uploadingLogo}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
      </div>

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

      <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-teal-700">GST configuration</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.enable_gst_calculation}
              onChange={(e) => setForm({ ...form, enable_gst_calculation: e.target.checked })}
              disabled={!canEdit}
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm">
              <span className="font-medium text-zinc-900">Enable GST calculation</span>
              <span className="block text-xs text-zinc-500">When off, bills show no GST line regardless of scheme.</span>
            </span>
          </label>
          <Field
            label="UPI ID"
            value={form.upi_id}
            onChange={(e) => setForm({ ...form, upi_id: e.target.value })}
            disabled={!canEdit}
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
            onChange={(e) => setForm({ ...form, near_expiry_alert_days: parseInt(e.target.value, 10) || 0 })}
            disabled={!canEdit}
            hint="Batches expiring within this many days are flagged."
          />
          <Field
            label="Low stock threshold"
            type="number"
            min={0}
            value={form.low_stock_threshold}
            onChange={(e) => setForm({ ...form, low_stock_threshold: parseInt(e.target.value, 10) || 0 })}
            disabled={!canEdit}
            hint="Default minimum stock level for medicines without their own setting."
          />
        </div>
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
// POS Hotkeys panel — reuses the HotkeyManagerModal already shipped in POS,
// surfaced here as a discoverable Settings entry (desktop parity §2.13.3).
// ============================================================================

function HotkeysPanel({ storeId }: { storeId: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [groups, setGroups] = useState<PosHotkeyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setGroups(await posGetHotkeyGroups(supabase, storeId));
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is redefined each render; only storeId should retrigger the fetch
  useEffect(() => { refresh(); }, [storeId]);

  const populated = groups.filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <SectionHeader
        title="POS Hotkeys"
        subtitle="Alt+1–9 bulk-add named medicine groups at the point of sale (e.g. Alt+1 = “Fever Pack”)."
      />

      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : populated.length === 0 ? (
        <p className="text-sm text-zinc-500">No hotkey groups configured yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-3">
          {populated.map((g) => (
            <li key={g.digit} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
              <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">Alt+{g.digit}</kbd>
              <p className="mt-1.5 text-sm font-semibold text-zinc-800">{g.name || 'Untitled group'}</p>
              <p className="text-xs text-zinc-500">{g.items.length} medicine{g.items.length === 1 ? '' : 's'}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={() => setOpen(true)}>Configure hotkeys</Button>
      </div>

      <HotkeyManagerModal
        open={open}
        onClose={() => setOpen(false)}
        storeId={storeId}
        groups={groups}
        onChange={refresh}
      />
    </div>
  );
}

// ============================================================================
// Shortcuts panel — printable reference rendered from the shared registry
// that also drives the live shortcut bindings (§2.13.6). Single source of
// truth: packages/hotkeys/src/shortcuts.ts.
// ============================================================================

function ShortcutsPanel() {
  const grouped = useMemo(() => shortcutsByCategory(), []);

  function printCheatsheet() {
    const rows = Object.entries(grouped)
      .filter(([, defs]) => defs.length > 0)
      .map(([category, defs]: [string, ShortcutDef[]]) => `
        <h2>${category}</h2>
        <table>
          ${defs.filter((d) => !d.hide).map((d) => `
            <tr>
              <td class="keys">${Array.isArray(d.keys) ? d.keys.join(' / ') : d.keys}</td>
              <td>${d.label}${d.planned ? ' <em>(coming soon)</em>' : ''}</td>
            </tr>
          `).join('')}
        </table>
      `).join('');

    const html = `<!doctype html><html><head><title>ShelfCure Shortcuts</title><style>
      body { font-family: system-ui, sans-serif; padding: 24px; color: #18181b; }
      h1 { margin-bottom: 4px; }
      h2 { margin-top: 24px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 6px 8px; border-bottom: 1px solid #e4e4e7; font-size: 13px; }
      .keys { font-family: monospace; font-weight: bold; width: 140px; }
      em { color: #a1a1aa; font-style: italic; }
    </style></head><body>
      <h1>Keyboard Shortcuts</h1>
      <p>ShelfCure Cloud — printed reference</p>
      ${rows}
    </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
        <SectionHeader title="Keyboard Shortcuts" subtitle="Every shortcut available across ShelfCure Cloud, grouped by area." />
        <Button type="button" variant="secondary" onClick={printCheatsheet}>Print cheatsheet</Button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {Object.entries(grouped)
          .filter(([, defs]) => defs.length > 0)
          .map(([category, defs]) => (
            <div key={category}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{category}</p>
              <ul className="space-y-1.5">
                {defs.filter((d) => !d.hide).map((d, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-sm">
                    <span className={d.planned ? 'text-zinc-400' : 'text-zinc-700'}>
                      {d.label}
                      {d.planned && <span className="ml-1.5 text-[10px] italic text-zinc-400">(coming soon)</span>}
                    </span>
                    <kbd className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-600">
                      {Array.isArray(d.keys) ? d.keys.join(' / ') : d.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </div>
  );
}

// ============================================================================
// Team panel — deep-links to the existing Staff page rather than duplicating
// its table (§2.13.5).
// ============================================================================

function TeamPanel() {
  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <SectionHeader
        title="Users & Roles"
        subtitle="Manage who has access to this organization and what they can do."
      />
      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">Staff directory</p>
          <p className="text-xs text-zinc-500">Add teammates, assign roles, and manage store access from the dedicated Staff page.</p>
        </div>
        <Link href="/dashboard/staff">
          <Button type="button" variant="secondary">Manage staff →</Button>
        </Link>
      </div>
    </div>
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
