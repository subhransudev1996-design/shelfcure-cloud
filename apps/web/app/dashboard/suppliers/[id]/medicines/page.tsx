import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '../../../../../lib/supabase/server';
import { getSupplierMedicines } from '@shelfcure/api-client';
import { SupplierMedicinesClient } from './supplier-medicines-client';

export default async function SupplierMedicinesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: sup } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('id', id)
    .single();

  if (!sup) notFound();

  const medicines = await getSupplierMedicines(supabase, id).catch(() => []);

  return <SupplierMedicinesClient supplierId={id} supplierName={sup.name} medicines={medicines} />;
}
