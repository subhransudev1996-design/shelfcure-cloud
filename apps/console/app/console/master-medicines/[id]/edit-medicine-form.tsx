'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateMasterMedicineConsole,
  DomainError,
  type DosageForm,
  type MasterMedicineListItem,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Alert } from '../../../../components/form-fields';
import { MedicineFormFields, medicineFormToPayload, type MedicineFormState } from '../medicine-form-fields';

function toForm(m: MasterMedicineListItem): MedicineFormState {
  return {
    name: m.name,
    salt_composition: m.salt_composition ?? '',
    manufacturer: m.manufacturer ?? '',
    strength: m.strength ?? '',
    dosage_form: m.dosage_form ?? '',
    pack_unit: m.pack_unit ?? '',
    pack_size: m.pack_size == null ? '' : String(m.pack_size),
    category: m.category ?? '',
    hsn_code: m.hsn_code ?? '',
    default_gst_rate: m.default_gst_rate == null ? '' : String(m.default_gst_rate),
    barcode: m.barcode ?? '',
  };
}

export function EditMedicineForm({
  medicine,
  dosageForms,
}: {
  medicine: MasterMedicineListItem;
  dosageForms: DosageForm[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<MedicineFormState>(() => toForm(medicine));

  function set<K extends keyof MedicineFormState>(k: K, v: MedicineFormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await updateMasterMedicineConsole(supabase, medicine.id, medicineFormToPayload(form));
      router.push('/console/master-medicines');
      router.refresh();
    } catch (e) {
      const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to update medicine';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <MedicineFormFields form={form} set={set} dosageForms={dosageForms} />
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={loading}>
          Save changes
        </Button>
        <Button variant="ghost" type="button" onClick={() => router.push('/console/master-medicines')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
