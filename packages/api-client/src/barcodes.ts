import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;
type UntypedRpc = (name: string, args?: Record<string, unknown>) => ReturnType<Client['rpc']>;
const rpc = (c: Client): UntypedRpc => c.rpc.bind(c) as unknown as UntypedRpc;

export interface BatchForBarcode {
  batch_id: string;
  medicine_id: string;
  medicine_name: string;
  manufacturer: string;
  batch_number: string;
  expiry_date: string;
  current_qty: number;
  mrp: number;
  gst_percentage: number;
  batch_barcode: string | null;
}

export async function listBatchesForBarcodes(
  client: Client,
  opts: { storeId: string; medicineId?: string | null },
): Promise<BatchForBarcode[]> {
  const { data, error } = await rpc(client)('rpc_list_batches_for_barcodes', {
    p_store_id: opts.storeId,
    p_medicine_id: opts.medicineId ?? undefined,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as BatchForBarcode[];
}

export async function saveBatchBarcodes(
  client: Client,
  batchIds: string[],
): Promise<{ saved: number }> {
  if (!batchIds.length) return { saved: 0 };
  const { data, error } = await rpc(client)('rpc_save_batch_barcodes', {
    p_batch_ids: batchIds,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as { saved: number };
}
