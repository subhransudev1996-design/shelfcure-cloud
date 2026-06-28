'use client';

import { useMemo, useState } from 'react';
import {
  createMedicine,
  updateMedicine,
  DomainError,
  type DosageForm,
  type MedicineCategory,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';

export interface QuickAddMedicineDefaults {
  name: string;
  salt_composition?: string | null;
  manufacturer?: string | null;
  strength?: string | null;
  dosage_form_name?: string | null;
  pack_unit?: string | null;
  pack_size?: number | null;
  hsn_code?: string | null;
  default_gst_rate?: number | null;
  category_name?: string | null;
}

const GST_OPTIONS = [0, 5, 12, 18, 28];

const inputCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

export function QuickAddMedicineModal({
  storeId,
  defaults,
  dosageForms,
  categories,
  onClose,
  onCreated,
}: {
  storeId: string;
  defaults: QuickAddMedicineDefaults;
  dosageForms: DosageForm[];
  categories: MedicineCategory[];
  onClose: () => void;
  onCreated: (medicine: { id: string; name: string }) => void;
}) {
  const matchedForm = dosageForms.find(
    (d) => d.name.toLowerCase() === (defaults.dosage_form_name ?? '').toLowerCase(),
  );
  const matchedCategory = defaults.category_name
    ? categories.find((c) => c.name.toLowerCase() === defaults.category_name!.toLowerCase())
    : undefined;

  const [name, setName] = useState(defaults.name);
  const [salt, setSalt] = useState(defaults.salt_composition ?? '');
  const [manufacturer, setManufacturer] = useState(defaults.manufacturer ?? '');
  const [strength, setStrength] = useState(defaults.strength ?? '');
  const [dosageFormId, setDosageFormId] = useState(
    matchedForm?.id ?? dosageForms.find((d) => d.name === 'Tablet')?.id ?? dosageForms[0]?.id ?? '',
  );
  const [packUnit, setPackUnit] = useState(defaults.pack_unit ?? 'Strip');
  const [packSize, setPackSize] = useState(String(defaults.pack_size ?? 10));
  const [saleMode, setSaleMode] = useState<'pack_only' | 'both'>('pack_only');
  const [unitsPerPack, setUnitsPerPack] = useState(String(defaults.pack_size ?? 10));
  const [hsn, setHsn] = useState(defaults.hsn_code ?? '');
  const [gst, setGst] = useState(String(defaults.default_gst_rate ?? 12));
  const [categoryId, setCategoryId] = useState(matchedCategory?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedFormName = useMemo(
    () => dosageForms.find((d) => d.id === dosageFormId)?.name ?? '',
    [dosageForms, dosageFormId],
  );
  const isTabOrCap = useMemo(() => ['tablet', 'capsule'].includes(selectedFormName.toLowerCase()), [selectedFormName]);

  async function onSave() {
    if (!name.trim()) {
      setError('Medicine name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const created = await createMedicine(supabase, {
        storeId,
        name: name.trim(),
        saltComposition: salt.trim() || undefined,
        manufacturer: manufacturer.trim() || undefined,
        dosageFormId,
        strength: strength.trim() || undefined,
        packSize: Number(packSize) || 1,
        packUnit: packUnit.trim() || 'strip',
        unitsPerPack: isTabOrCap && saleMode === 'both' ? Number(unitsPerPack) || null : null,
        saleUnitMode: isTabOrCap ? saleMode : 'pack_only',
        defaultGstRate: Number(gst) || 0,
        hsnCode: hsn.trim() || undefined,
      });
      if (categoryId) {
        await updateMedicine(supabase, created.id, { categoryId });
      }
      onCreated({ id: created.id, name: created.name });
    } catch (e) {
      setError(e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to add medicine');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-bold text-zinc-900">Add new medicine</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Pre-filled from the scanned bill{matchedCategory || matchedForm ? ' and the master catalog' : ''}. Review
          and adjust before saving.
        </p>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600">Medicine name *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600">Salt / Composition</span>
              <input value={salt} onChange={(e) => setSalt(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600">Manufacturer</span>
              <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className={inputCls} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600">Strength</span>
              <input value={strength} onChange={(e) => setStrength(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600">Dosage form</span>
              <select value={dosageFormId} onChange={(e) => setDosageFormId(e.target.value)} className={inputCls}>
                {dosageForms.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600">Pack unit</span>
              <input value={packUnit} onChange={(e) => setPackUnit(e.target.value)} className={inputCls} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600">Pack size</span>
              <input
                type="number"
                min={1}
                value={packSize}
                onChange={(e) => setPackSize(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600">HSN code</span>
              <input value={hsn} onChange={(e) => setHsn(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600">GST %</span>
              <select value={gst} onChange={(e) => setGst(e.target.value)} className={inputCls}>
                {GST_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          {isTabOrCap && (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-zinc-600">Sale configuration</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSaleMode('pack_only')}
                  className={`rounded-lg border-2 px-3 py-2 text-left transition ${
                    saleMode === 'pack_only' ? 'border-emerald-500 bg-emerald-50/40' : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <div className="text-xs font-semibold text-zinc-900">Pack Only ({packUnit || 'Strip'})</div>
                  <div className="text-[11px] text-zinc-500">Sold in complete packs only.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSaleMode('both')}
                  className={`rounded-lg border-2 px-3 py-2 text-left transition ${
                    saleMode === 'both' ? 'border-emerald-500 bg-emerald-50/40' : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <div className="text-xs font-semibold text-zinc-900">Flexible (Unit / {packUnit || 'Strip'})</div>
                  <div className="text-[11px] text-zinc-500">Can sell individual units or full packs.</div>
                  {saleMode === 'both' && (
                    <input
                      type="number"
                      min={1}
                      value={unitsPerPack}
                      onChange={(e) => setUnitsPerPack(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Units per pack"
                      className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none"
                    />
                  )}
                </button>
              </div>
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600">Category (optional)</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" type="button" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={onSave} loading={saving} className="flex-1">
            Add medicine
          </Button>
        </div>
      </div>
    </div>
  );
}
