import Link from 'next/link';
import { listDosageForms } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { PageHeader } from '../../../../components/ui/page-header';
import { CreateMedicineForm } from './create-medicine-form';

export default async function NewMasterMedicinePage() {
  const supabase = await getSupabaseServerClient();
  const dosageForms = await listDosageForms(supabase);

  return (
    <>
      <div className="mb-4">
        <Link href="/console/master-medicines" className="text-sm font-medium text-zinc-500 hover:text-zinc-800">
          ← Back to master medicines
        </Link>
      </div>

      <PageHeader
        eyebrow="Catalog"
        title="Add a medicine to the catalog"
        description="Instantly available in every store's Add Medicine autocomplete once saved."
      />

      <CreateMedicineForm dosageForms={dosageForms} />
    </>
  );
}
