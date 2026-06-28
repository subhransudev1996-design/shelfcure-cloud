import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;
type UntypedRpc = (name: string, args?: Record<string, unknown>) => ReturnType<Client['rpc']>;
const rpc = (c: Client): UntypedRpc => c.rpc.bind(c) as unknown as UntypedRpc;

export interface MasterMedicine {
  id: string;
  name: string;
  salt_composition: string | null;
  strength: string | null;
  manufacturer: string | null;
  dosage_form: string | null;
  pack_size: number | null;
  pack_unit: string | null;
  units_per_pack: number | null;
  hsn_code: string | null;
  default_gst_rate: number | null;
  barcode: string | null;
  category: string | null;
}

export async function searchMasterMedicines(
  client: Client,
  opts: { query: string; limit?: number },
): Promise<MasterMedicine[]> {
  const q = opts.query.trim();
  if (q.length < 2) return [];
  const { data, error } = await rpc(client)('rpc_master_medicine_search', {
    p_query: q,
    p_limit: opts.limit ?? 30,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as MasterMedicine[];
}

// ============================================================================
// ShelfCure Console — platform-admin CRUD over the global master_medicines
// catalog. Gated server-side by is_platform_admin() on every RPC.
// ============================================================================

export interface MasterMedicineListItem extends MasterMedicine {
  created_at: string;
  updated_at: string;
}

export interface MasterMedicineInput {
  name: string;
  salt_composition?: string | null;
  strength?: string | null;
  manufacturer?: string | null;
  dosage_form?: string | null;
  pack_size?: number | null;
  pack_unit?: string | null;
  units_per_pack?: number | null;
  hsn_code?: string | null;
  default_gst_rate?: number | null;
  barcode?: string | null;
  category?: string | null;
}

export async function listMasterMedicinesConsole(
  client: Client,
  opts: { query?: string; page?: number; limit?: number } = {},
): Promise<{ items: MasterMedicineListItem[]; totalCount: number }> {
  const { data, error } = await rpc(client)('rpc_console_list_master_medicines', {
    p_query: opts.query?.trim() || null,
    p_page: opts.page ?? 1,
    p_limit: opts.limit ?? 50,
  });
  if (error) throw mapSupabaseError(error);
  const rows = (data ?? []) as unknown as (MasterMedicineListItem & { total_count: number })[];
  return {
    items: rows.map(({ total_count: _total_count, ...rest }) => rest),
    totalCount: rows[0]?.total_count ?? 0,
  };
}

export async function getMasterMedicineConsole(client: Client, id: string): Promise<MasterMedicineListItem | null> {
  const { data, error } = await client.from('master_medicines').select('*').eq('id', id).maybeSingle();
  if (error) throw mapSupabaseError(error);
  return data as unknown as MasterMedicineListItem | null;
}

export async function createMasterMedicineConsole(
  client: Client,
  input: MasterMedicineInput,
): Promise<MasterMedicineListItem> {
  const { data, error } = await rpc(client)('rpc_console_create_master_medicine', { p_payload: input });
  if (error) throw mapSupabaseError(error);
  return data as unknown as MasterMedicineListItem;
}

export async function updateMasterMedicineConsole(
  client: Client,
  id: string,
  input: Partial<MasterMedicineInput>,
): Promise<MasterMedicineListItem> {
  const { data, error } = await rpc(client)('rpc_console_update_master_medicine', {
    p_id: id,
    p_payload: input,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as MasterMedicineListItem;
}

export async function deleteMasterMedicineConsole(client: Client, id: string): Promise<void> {
  const { error } = await rpc(client)('rpc_console_delete_master_medicine', { p_id: id });
  if (error) throw mapSupabaseError(error);
}

export interface BulkImportResult {
  inserted: number;
  skipped: string[];
  errors: string[];
}

export async function bulkImportMasterMedicinesConsole(
  client: Client,
  items: MasterMedicineInput[],
): Promise<BulkImportResult> {
  const { data, error } = await rpc(client)('rpc_console_bulk_import_master_medicines', { p_items: items });
  if (error) throw mapSupabaseError(error);
  return data as unknown as BulkImportResult;
}
