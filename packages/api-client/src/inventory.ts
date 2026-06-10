import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;
// Migration 0021 added 11 new RPCs that aren't in db-types yet (regenerate
// `pnpm gen:db-types` after the migration deploys). Until then we escape via
// the untyped rpc surface — runtime is identical.
type UntypedRpc = (name: string, args?: Record<string, unknown>) => ReturnType<Client['rpc']>;
const rpc = (c: Client): UntypedRpc => c.rpc.bind(c) as unknown as UntypedRpc;

// ============================================================================
// Inventory list (medicines + nearest-expiry pricing + total stock)
// ============================================================================

export interface InventoryRow {
  id: string;
  name: string;
  salt_composition: string | null;
  manufacturer: string;
  dosage_form_id: string;
  dosage_form_name: string | null;
  strength: string | null;
  category_id: string | null;
  category_name: string | null;
  pack_size: number;
  pack_unit: string;
  units_per_pack: number | null;
  sale_unit_mode: 'individual' | 'pack_only' | 'both';
  min_stock_level: number;
  reorder_level: number;
  default_gst_rate: number;
  hsn_code: string | null;
  rack_location: string | null;
  is_focused: boolean;
  focus_label: string | null;
  created_at: string;
  total_stock: number;
  near_expiry_count: number;
  active_batch_count: number;
  mrp: number | null;
  selling_price: number | null;
  purchase_rate: number | null;
  total_count: number;
}

export interface ListInventoryResult {
  rows: InventoryRow[];
  total: number;
}

export async function listInventory(
  client: Client,
  opts: { storeId: string; query?: string; page?: number; limit?: number },
): Promise<ListInventoryResult> {
  const { data, error } = await rpc(client)('rpc_list_medicines_with_stock', {
    p_store_id: opts.storeId,
    p_query: opts.query ?? undefined,
    p_page: opts.page ?? 1,
    p_limit: opts.limit ?? 100,
  });
  if (error) throw mapSupabaseError(error);
  const rows = (data ?? []) as unknown as InventoryRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

// ============================================================================
// Medicine detail (single JSON payload)
// ============================================================================

export interface DetailBatch {
  id: string;
  batch_number: string;
  expiry_date: string;
  current_quantity: number;
  initial_quantity: number;
  mrp: number;
  selling_price: number | null;
  purchase_rate: number;
  gst_percentage: number;
  batch_barcode: string | null;
  days_to_expiry: number;
  supplier_name: string | null;
  supplier_id: string | null;
  is_blocked: boolean;
}

export interface DetailStats {
  total_stock: number;
  active_batches: number;
  near_expiry_count: number;
  min_stock_level: number;
}

export interface BrandAlternative {
  id: string;
  name: string;
  manufacturer: string;
  strength: string | null;
  dosage_form_name: string | null;
  sale_unit_mode: 'individual' | 'pack_only' | 'both';
  units_per_pack: number | null;
  stock: number;
  mrp: number | null;
  selling_price: number | null;
}

export interface MedicineDetail {
  medicine: InventoryRow & {
    dosage_form_base_unit?: string | null;
  };
  batches: DetailBatch[];
  stats: DetailStats;
  alternatives: BrandAlternative[];
}

export async function getMedicineDetail(
  client: Client,
  opts: { medicineId: string; storeId: string },
): Promise<MedicineDetail> {
  const { data, error } = await rpc(client)('rpc_get_medicine_detail', {
    p_medicine_id: opts.medicineId,
    p_store_id: opts.storeId,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as MedicineDetail;
}

// ============================================================================
// Toggle focused + label
// ============================================================================

export async function toggleFocused(
  client: Client,
  opts: { medicineId: string; isFocused: boolean; label?: string | null },
): Promise<void> {
  const { error } = await rpc(client)('rpc_toggle_focused', {
    p_medicine_id: opts.medicineId,
    p_is_focused: opts.isFocused,
    p_label: opts.label ?? undefined,
  });
  if (error) throw mapSupabaseError(error);
}

// ============================================================================
// Update medicine
// ============================================================================

export interface UpdateMedicineInput {
  name?: string;
  saltComposition?: string | null;
  manufacturer?: string;
  dosageFormId?: string;
  strength?: string | null;
  packSize?: number;
  packUnit?: string;
  unitsPerPack?: number | null;
  saleUnitMode?: 'individual' | 'pack_only' | 'both';
  categoryId?: string | null;
  rackLocation?: string | null;
  hsnCode?: string | null;
  defaultGstRate?: number;
  minStockLevel?: number;
  reorderLevel?: number;
}

export async function updateMedicine(
  client: Client,
  medicineId: string,
  input: UpdateMedicineInput,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.saltComposition !== undefined) payload.salt_composition = input.saltComposition;
  if (input.manufacturer !== undefined) payload.manufacturer = input.manufacturer;
  if (input.dosageFormId !== undefined) payload.dosage_form_id = input.dosageFormId;
  if (input.strength !== undefined) payload.strength = input.strength;
  if (input.packSize !== undefined) payload.pack_size = input.packSize;
  if (input.packUnit !== undefined) payload.pack_unit = input.packUnit;
  if (input.unitsPerPack !== undefined) payload.units_per_pack = input.unitsPerPack;
  if (input.saleUnitMode !== undefined) payload.sale_unit_mode = input.saleUnitMode;
  if (input.categoryId !== undefined) payload.category_id = input.categoryId;
  if (input.rackLocation !== undefined) payload.rack_location = input.rackLocation;
  if (input.hsnCode !== undefined) payload.hsn_code = input.hsnCode;
  if (input.defaultGstRate !== undefined) payload.default_gst_rate = input.defaultGstRate;
  if (input.minStockLevel !== undefined) payload.min_stock_level = input.minStockLevel;
  if (input.reorderLevel !== undefined) payload.reorder_level = input.reorderLevel;

  const { error } = await rpc(client)('rpc_update_medicine', {
    p_medicine_id: medicineId,
    p_payload: payload as never,
  });
  if (error) throw mapSupabaseError(error);
}

// ============================================================================
// Manual batch add / batch edit
// ============================================================================

export interface AddBatchInput {
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  quantity: number;
  purchaseRate: number;
  mrp: number;
  sellingPrice?: number | null;
  gstPercentage?: number;
  batchBarcode?: string | null;
  supplierId?: string | null;
}

export async function addBatchManual(
  client: Client,
  opts: { medicineId: string; storeId: string; input: AddBatchInput },
): Promise<void> {
  const { error } = await rpc(client)('rpc_add_batch_manual', {
    p_medicine_id: opts.medicineId,
    p_store_id: opts.storeId,
    p_payload: {
      batch_number: opts.input.batchNumber,
      expiry_date: opts.input.expiryDate,
      quantity: opts.input.quantity,
      purchase_rate: opts.input.purchaseRate,
      mrp: opts.input.mrp,
      selling_price: opts.input.sellingPrice ?? null,
      gst_percentage: opts.input.gstPercentage ?? 0,
      batch_barcode: opts.input.batchBarcode ?? null,
      supplier_id: opts.input.supplierId ?? null,
    } as never,
  });
  if (error) throw mapSupabaseError(error);
}

export interface UpdateBatchInput {
  batchNumber?: string;
  expiryDate?: string;
  purchaseRate?: number;
  mrp?: number;
  sellingPrice?: number | null;
  gstPercentage?: number;
  batchBarcode?: string | null;
  supplierId?: string | null;
}

export async function updateBatch(
  client: Client,
  batchId: string,
  input: UpdateBatchInput,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (input.batchNumber !== undefined) payload.batch_number = input.batchNumber;
  if (input.expiryDate !== undefined) payload.expiry_date = input.expiryDate;
  if (input.purchaseRate !== undefined) payload.purchase_rate = input.purchaseRate;
  if (input.mrp !== undefined) payload.mrp = input.mrp;
  if (input.sellingPrice !== undefined) payload.selling_price = input.sellingPrice;
  if (input.gstPercentage !== undefined) payload.gst_percentage = input.gstPercentage;
  if (input.batchBarcode !== undefined) payload.batch_barcode = input.batchBarcode;
  if (input.supplierId !== undefined) payload.supplier_id = input.supplierId;

  const { error } = await rpc(client)('rpc_update_batch', {
    p_batch_id: batchId,
    p_payload: payload as never,
  });
  if (error) throw mapSupabaseError(error);
}
