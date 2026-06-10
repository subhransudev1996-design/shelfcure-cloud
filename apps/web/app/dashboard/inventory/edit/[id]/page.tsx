import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../../lib/active-store';
import { getMedicineDetail, listCategories } from '@shelfcure/api-client';
import { MedicineForm } from '../../_components/medicine-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditMedicinePage({ params }: Props) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);

  if (!storeId) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">No store yet</h1>
        <Link href="/dashboard/stores" className="mt-4 inline-flex text-sm font-medium text-emerald-700">
          Create your first store →
        </Link>
      </div>
    );
  }

  let detail;
  try {
    detail = await getMedicineDetail(supabase, { medicineId: id, storeId });
  } catch { notFound(); }

  const [{ data: dosageForms }, categories] = await Promise.all([
    supabase.from('dosage_forms').select('*').eq('is_active', true).order('sort_order'),
    listCategories(supabase, storeId),
  ]);

  const m = detail.medicine;
  return (
    <MedicineForm
      mode="edit"
      dosageForms={dosageForms ?? []}
      initialCategories={categories}
      storeId={storeId}
      initial={{
        id: m.id,
        name: m.name,
        salt_composition: m.salt_composition,
        manufacturer: m.manufacturer,
        dosage_form_id: m.dosage_form_id,
        strength: m.strength,
        pack_size: m.pack_size,
        pack_unit: m.pack_unit,
        units_per_pack: m.units_per_pack,
        sale_unit_mode: m.sale_unit_mode,
        category_id: m.category_id,
        rack_location: m.rack_location,
        hsn_code: m.hsn_code,
        default_gst_rate: Number(m.default_gst_rate),
        min_stock_level: m.min_stock_level,
        reorder_level: m.reorder_level,
        hasStock: detail.stats.total_stock > 0,
      }}
    />
  );
}
