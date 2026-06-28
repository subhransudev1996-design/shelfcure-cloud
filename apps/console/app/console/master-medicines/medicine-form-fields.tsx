'use client';

import type { DosageForm } from '@shelfcure/api-client';
import { Field } from '../../../components/form-fields';

export interface MedicineFormState {
  name: string;
  salt_composition: string;
  manufacturer: string;
  strength: string;
  dosage_form: string;
  pack_unit: string;
  pack_size: string;
  category: string;
  hsn_code: string;
  default_gst_rate: string;
  barcode: string;
}

export const EMPTY_MEDICINE_FORM: MedicineFormState = {
  name: '',
  salt_composition: '',
  manufacturer: '',
  strength: '',
  dosage_form: '',
  pack_unit: '',
  pack_size: '',
  category: '',
  hsn_code: '',
  default_gst_rate: '',
  barcode: '',
};

/** Shared fields for the global master_medicines catalog — reused by create + edit. */
export function MedicineFormFields({
  form,
  set,
  dosageForms,
}: {
  form: MedicineFormState;
  set: <K extends keyof MedicineFormState>(k: K, v: MedicineFormState[K]) => void;
  dosageForms: DosageForm[];
}) {
  return (
    <div className="space-y-4">
      <Field
        label="Medicine name"
        value={form.name}
        onChange={(e) => set('name', e.target.value)}
        required
        minLength={1}
        placeholder="e.g. Paracetamol 500mg"
      />

      <Field
        label="Salt / Composition"
        value={form.salt_composition}
        onChange={(e) => set('salt_composition', e.target.value)}
        placeholder="e.g. Paracetamol, Amoxicillin + Clavulanic Acid"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Manufacturer"
          value={form.manufacturer}
          onChange={(e) => set('manufacturer', e.target.value)}
          placeholder="e.g. Cipla, Sun Pharma"
        />
        <Field
          label="Strength / Concentration"
          value={form.strength}
          onChange={(e) => set('strength', e.target.value)}
          placeholder="e.g. 500mg, 10mg/5ml"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-800">Dosage Form</span>
          <select
            value={form.dosage_form}
            onChange={(e) => set('dosage_form', e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm transition-all hover:border-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
          >
            <option value="">—</option>
            {dosageForms.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Pack Unit"
          value={form.pack_unit}
          onChange={(e) => set('pack_unit', e.target.value)}
          placeholder="e.g. Strip, Bottle"
        />
        <Field
          label="Pack Size"
          type="number"
          min={1}
          value={form.pack_size}
          onChange={(e) => set('pack_size', e.target.value)}
          placeholder="e.g. 10"
          hint="Qty per pack"
        />
      </div>

      <Field
        label="Category (optional)"
        value={form.category}
        onChange={(e) => set('category', e.target.value)}
        placeholder="e.g. Antibiotic, Painkiller"
        hint="Free text — stores' own category lists are matched by name when this medicine is picked from the catalog."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="HSN Code (optional)"
          value={form.hsn_code}
          onChange={(e) => set('hsn_code', e.target.value)}
          placeholder="e.g. 3004"
        />
        <Field
          label="Default GST Rate % (optional)"
          type="number"
          min={0}
          max={28}
          value={form.default_gst_rate}
          onChange={(e) => set('default_gst_rate', e.target.value)}
          placeholder="e.g. 12"
        />
        <Field
          label="Barcode (optional)"
          value={form.barcode}
          onChange={(e) => set('barcode', e.target.value)}
        />
      </div>
    </div>
  );
}

export function medicineFormToPayload(form: MedicineFormState) {
  return {
    name: form.name.trim(),
    salt_composition: form.salt_composition.trim() || null,
    manufacturer: form.manufacturer.trim() || null,
    strength: form.strength.trim() || null,
    dosage_form: form.dosage_form.trim() || null,
    pack_unit: form.pack_unit.trim() || null,
    pack_size: form.pack_size === '' ? null : Number(form.pack_size),
    units_per_pack: form.pack_size === '' ? null : Number(form.pack_size),
    category: form.category.trim() || null,
    hsn_code: form.hsn_code.trim() || null,
    default_gst_rate: form.default_gst_rate === '' ? null : Number(form.default_gst_rate),
    barcode: form.barcode.trim() || null,
  };
}
