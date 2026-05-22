'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createMedicine,
  listMedicines,
  softDeleteMedicine,
  type DosageForm,
  type Medicine,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { EmptyState } from '../../../components/ui/empty-state';
import { Field, Alert } from '../../../components/form-fields';

interface Store {
  id: string;
  code: string;
  name: string;
}

interface Props {
  role: string;
  userStoreId: string | null;
  stores: Store[];
  dosageForms: DosageForm[];
}

export function MedicinesView({ role, userStoreId, stores, dosageForms }: Props) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [items, setItems] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const canAdd = role !== 'cashier' && role !== 'accountant';
  const canAddNoStore = stores.length === 0 && role !== 'super_admin';

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMedicines(supabase, { search });
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [supabase, search]);

  useEffect(() => {
    const t = setTimeout(refresh, 250); // debounce
    return () => clearTimeout(t);
  }, [refresh]);

  async function onDelete(id: string) {
    if (!confirm('Soft-delete this medicine?')) return;
    await softDeleteMedicine(supabase, id);
    refresh();
  }

  const formByName = useMemo(() => {
    const m = new Map<string, DosageForm>();
    for (const f of dosageForms) m.set(f.id, f);
    return m;
  }, [dosageForms]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <svg viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400">
            <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicines by name…"
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-[15px] shadow-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
          />
        </div>
        <div className="text-sm text-zinc-500">
          {loading ? 'Loading…' : `${items.length} medicine${items.length === 1 ? '' : 's'}`}
        </div>
        {canAdd && (
          <Button
            onClick={() => setAddOpen(true)}
            disabled={canAddNoStore}
            title={canAddNoStore ? 'Add a store first.' : undefined}
            leadingIcon={
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
              </svg>
            }
          >
            Add medicine
          </Button>
        )}
      </div>

      {!loading && items.length === 0 && (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M8.5 3.5a5 5 0 1 1 7.07 7.07l-5.5 5.5a5 5 0 1 1-7.07-7.07l5.5-5.5Z M12 7l5 5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
            </svg>
          }
          title={search ? 'No matches' : 'No medicines yet'}
          description={
            search
              ? `Nothing matches "${search}". Try a different search.`
              : canAddNoStore
                ? 'Add a store first, then start populating your medicine master.'
                : 'Add your first medicine to start tracking stock and sales.'
          }
          action={canAdd && !search && !canAddNoStore ? (
            <Button onClick={() => setAddOpen(true)}>Add your first medicine</Button>
          ) : null}
        />
      )}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Form</th>
                <th className="px-4 py-3">Manufacturer</th>
                <th className="px-4 py-3 text-right">Pack</th>
                <th className="px-4 py-3 text-right">GST%</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {items.map((m) => {
                const form = formByName.get(m.dosage_form_id);
                return (
                  <tr key={m.id} className="transition-colors hover:bg-zinc-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{m.name}</div>
                      {m.salt_composition && (
                        <div className="text-xs text-zinc-500">{m.salt_composition}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {form?.name ?? '—'}
                      {m.strength && <span className="text-zinc-500"> · {m.strength}</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{m.manufacturer || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                      {m.pack_size} {m.pack_unit}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                      {Number(m.default_gst_rate).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canAdd && (
                        <button
                          onClick={() => onDelete(m.id)}
                          className="text-xs font-medium text-red-600 opacity-0 transition-opacity hover:underline group-hover:opacity-100"
                          style={{ opacity: 0.5 }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddMedicineModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        role={role}
        userStoreId={userStoreId}
        stores={stores}
        dosageForms={dosageForms}
        onCreated={refresh}
      />
    </>
  );
}

function AddMedicineModal({
  open,
  onClose,
  role,
  userStoreId,
  stores,
  dosageForms,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  role: string;
  userStoreId: string | null;
  stores: Store[];
  dosageForms: DosageForm[];
  onCreated: () => void;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    storeId: userStoreId ?? stores[0]?.id ?? '',
    name: '',
    salt: '',
    manufacturer: '',
    dosageFormId: dosageForms.find((d) => d.name === 'Tablet')?.id ?? dosageForms[0]?.id ?? '',
    strength: '',
    packSize: '1',
    packUnit: 'strip',
    defaultGstRate: '12',
    hsn: '',
    barcode: '',
  });

  function reset() {
    setForm({
      storeId: userStoreId ?? stores[0]?.id ?? '',
      name: '',
      salt: '',
      manufacturer: '',
      dosageFormId: dosageForms.find((d) => d.name === 'Tablet')?.id ?? dosageForms[0]?.id ?? '',
      strength: '',
      packSize: '1',
      packUnit: 'strip',
      defaultGstRate: '12',
      hsn: '',
      barcode: '',
    });
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createMedicine(supabase, {
        storeId: form.storeId || null,
        name: form.name,
        saltComposition: form.salt,
        manufacturer: form.manufacturer,
        dosageFormId: form.dosageFormId,
        strength: form.strength,
        packSize: Number(form.packSize) || 1,
        packUnit: form.packUnit,
        defaultGstRate: Number(form.defaultGstRate) || 0,
        hsnCode: form.hsn,
        barcode: form.barcode,
      });
      onClose();
      reset();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add medicine');
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title="Add a medicine"
      description="The minimum is name + dosage form. The rest is optional."
      maxWidth="xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => { onClose(); reset(); }}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={loading} type="submit">
            Add medicine
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {role === 'super_admin' && stores.length > 0 && (
          <SelectField
            label="Store"
            value={form.storeId}
            onChange={(v) => set('storeId', v)}
            options={stores.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` }))}
            hint="Pick the store this medicine belongs to."
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            placeholder="e.g. Crocin 650"
          />
          <Field
            label="Salt / Composition"
            value={form.salt}
            onChange={(e) => set('salt', e.target.value)}
            placeholder="e.g. Paracetamol 650mg"
          />
          <Field
            label="Manufacturer"
            value={form.manufacturer}
            onChange={(e) => set('manufacturer', e.target.value)}
            placeholder="e.g. GSK"
          />
          <SelectField
            label="Dosage form"
            value={form.dosageFormId}
            onChange={(v) => set('dosageFormId', v)}
            options={dosageForms.map((d) => ({ value: d.id, label: d.name }))}
            required
          />
          <Field
            label="Strength"
            value={form.strength}
            onChange={(e) => set('strength', e.target.value)}
            placeholder="e.g. 650mg"
          />
          <Field
            label="HSN code"
            value={form.hsn}
            onChange={(e) => set('hsn', e.target.value)}
            placeholder="e.g. 30049011"
            maxLength={8}
            inputMode="numeric"
          />
          <Field
            label="Pack size"
            type="number"
            min={1}
            value={form.packSize}
            onChange={(e) => set('packSize', e.target.value)}
            required
          />
          <Field
            label="Pack unit"
            value={form.packUnit}
            onChange={(e) => set('packUnit', e.target.value)}
            placeholder="strip / box / bottle"
          />
          <Field
            label="Default GST %"
            type="number"
            min={0}
            max={28}
            step={0.5}
            value={form.defaultGstRate}
            onChange={(e) => set('defaultGstRate', e.target.value)}
          />
          <Field
            label="Barcode (optional)"
            value={form.barcode}
            onChange={(e) => set('barcode', e.target.value)}
          />
        </div>
        {error && <Alert variant="error">{error}</Alert>}
      </form>
    </Modal>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-zinc-800">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-[15px] text-zinc-900 shadow-sm transition-all hover:border-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1.5 text-xs text-zinc-500">{hint}</p>}
    </label>
  );
}
