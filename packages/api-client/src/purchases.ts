import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

export interface RecentPurchaseRate {
  rate: number;
  bill_date: string;
  supplier_name: string;
}

export async function getRecentPurchaseRates(
  client: Client,
  storeId: string,
  medicineId: string,
  limit = 3,
): Promise<RecentPurchaseRate[]> {
  const { data, error } = await client.rpc('rpc_get_recent_purchase_rates', {
    p_store_id: storeId,
    p_medicine_id: medicineId,
    p_limit: limit,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as RecentPurchaseRate[];
}

export async function checkDuplicateBill(
  client: Client,
  storeId: string,
  supplierId: string,
  billNumber: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('rpc_check_duplicate_bill', {
    p_store_id: storeId,
    p_supplier_id: supplierId,
    p_bill_number: billNumber,
  });
  if (error) throw mapSupabaseError(error);
  return data as boolean;
}
