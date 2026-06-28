'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMasterMedicineConsole, DomainError, type DosageForm } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Alert } from '../../../../components/form-fields';
import { MedicineFormFields, medicineFormToPayload, EMPTY_MEDICINE_FORM, type MedicineFormState } from '../medicine-form-fields';

export function CreateMedicineForm({ dosageForms }: { dosageForms: DosageForm[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<MedicineFormState>(EMPTY_MEDICINE_FORM);

  function set<K extends keyof MedicineFormState>(k: K, v: MedicineFormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await createMasterMedicineConsole(supabase, medicineFormToPayload(form));
      router.push('/console/master-medicines');
      router.refresh();
    } catch (e) {
      const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to add medicine';
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
          Add medicine
        </Button>
        <Button variant="ghost" type="button" onClick={() => router.push('/console/master-medicines')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
