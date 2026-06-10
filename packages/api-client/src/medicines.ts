import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;
type MedicineRow = Database['public']['Tables']['medicines']['Row'];
type DosageFormRow = Database['public']['Tables']['dosage_forms']['Row'];

export type Medicine = MedicineRow;
export type DosageForm = DosageFormRow;

export async function listDosageForms(client: Client): Promise<DosageForm[]> {
  const { data, error } = await client
    .from('dosage_forms')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw mapSupabaseError(error);
  return data ?? [];
}

export interface ListMedicinesOptions {
  search?: string;
  limit?: number;
  storeId?: string | null;
}

export async function listMedicines(
  client: Client,
  opts: ListMedicinesOptions = {},
): Promise<Medicine[]> {
  let q = client
    .from('medicines')
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(opts.limit ?? 200);

  if (opts.storeId !== undefined) {
    if (opts.storeId === null) q = q.is('store_id', null);
    else q = q.eq('store_id', opts.storeId);
  }
  if (opts.search?.trim()) {
    q = q.ilike('name', `%${opts.search.trim()}%`);
  }

  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);
  return data ?? [];
}

export interface CreateMedicineInput {
  storeId: string | null; // null = org-wide (super_admin + shared_masters)
  name: string;
  saltComposition?: string;
  manufacturer?: string;
  dosageFormId: string;
  strength?: string;
  packSize?: number;
  packUnit?: string;
  unitsPerPack?: number | null;
  saleUnitMode?: 'individual' | 'pack_only' | 'both';
  defaultGstRate?: number;
  hsnCode?: string;
  barcode?: string;
  reorderLevel?: number;
  minStockLevel?: number;
}

/**
 * Create a medicine via the secure RPC (same pattern as createStore / createSupplier).
 * The RPC enforces the role/org check in SQL and bypasses PostgREST RLS quirks
 * that have bitten direct .from('table').insert() calls on multi-tenant tables.
 */
export async function createMedicine(
  client: Client,
  input: CreateMedicineInput,
): Promise<Medicine> {
  const payload = {
    store_id: input.storeId,
    name: input.name.trim(),
    salt_composition: input.saltComposition?.trim() || null,
    manufacturer: input.manufacturer?.trim() ?? '',
    dosage_form_id: input.dosageFormId,
    strength: input.strength?.trim() || null,
    pack_size: input.packSize ?? 1,
    pack_unit: input.packUnit?.trim() || 'strip',
    units_per_pack: input.unitsPerPack ?? null,
    sale_unit_mode: input.saleUnitMode ?? 'pack_only',
    default_gst_rate: input.defaultGstRate ?? 0,
    hsn_code: input.hsnCode?.trim() || null,
    barcode: input.barcode?.trim() || null,
    reorder_level: input.reorderLevel ?? 20,
    min_stock_level: input.minStockLevel ?? 10,
  };

  const { data, error } = await client.rpc('rpc_create_medicine', { p_payload: payload as never });
  if (error) throw mapSupabaseError(error);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw mapSupabaseError(new Error('rpc_create_medicine returned no row'));

  // Read back the full row so callers get the same Medicine shape they expected before.
  const fetched = await client.from('medicines').select('*').eq('id', row.id).single();
  if (fetched.error || !fetched.data) {
    throw mapSupabaseError(fetched.error ?? new Error('medicine created but read-back failed'));
  }
  return fetched.data;
}

export async function softDeleteMedicine(client: Client, id: string): Promise<void> {
  const { error } = await client
    .from('medicines')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw mapSupabaseError(error);
}
