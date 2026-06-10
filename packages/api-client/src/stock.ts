import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

export interface StockBatchRow {
  batch_id: string;
  medicine_id: string;
  medicine_name: string;
  manufacturer: string;
  batch_number: string;
  expiry_date: string;
  on_hand: number;
  mrp: number;
  purchase_rate: number;
  gst_percentage: number;
  days_to_expiry: number;
  is_blocked: boolean;
}

export async function listStockBatches(
  client: Client,
  opts: { storeId: string; query?: string; limit?: number; offset?: number },
): Promise<StockBatchRow[]> {
  const { data, error } = await client.rpc('rpc_list_stock_batches', {
    p_store_id: opts.storeId,
    p_query: opts.query ?? undefined,
    p_limit: opts.limit ?? 100,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as StockBatchRow[];
}
