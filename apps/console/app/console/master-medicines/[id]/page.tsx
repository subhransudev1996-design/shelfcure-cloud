import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMasterMedicineConsole, listDosageForms } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { PageHeader } from '../../../../components/ui/page-header';
import { EditMedicineForm } from './edit-medicine-form';

export default async function EditMasterMedicinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const [medicine, dosageForms] = await Promise.all([
    getMasterMedicineConsole(supabase, id),
    listDosageForms(supabase),
  ]);
  if (!medicine) notFound();

  return (
    <>
      <div className="mb-4">
        <Link href="/console/master-medicines" className="text-sm font-medium text-zinc-500 hover:text-zinc-800">
          ← Back to master medicines
        </Link>
      </div>

      <PageHeader eyebrow="Catalog" title={`Edit ${medicine.name}`} description="Changes are reflected immediately in every store's Add Medicine autocomplete." />

      <EditMedicineForm medicine={medicine} dosageForms={dosageForms} />
    </>
  );
}
