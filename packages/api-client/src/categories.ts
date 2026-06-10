import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;
type UntypedRpc = (name: string, args?: Record<string, unknown>) => ReturnType<Client['rpc']>;
const rpc = (c: Client): UntypedRpc => c.rpc.bind(c) as unknown as UntypedRpc;

export interface MedicineCategory {
  id: string;
  name: string;
  is_system: boolean;
  store_id: string | null;
}

export async function listCategories(
  client: Client,
  storeId?: string | null,
): Promise<MedicineCategory[]> {
  const { data, error } = await rpc(client)('rpc_list_categories', {
    p_store_id: storeId ?? undefined,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as MedicineCategory[];
}

export async function createCategory(
  client: Client,
  opts: { name: string; storeId?: string | null },
): Promise<MedicineCategory> {
  const { data, error } = await rpc(client)('rpc_create_category', {
    p_name: opts.name,
    p_store_id: opts.storeId ?? undefined,
  });
  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  return row as unknown as MedicineCategory;
}
