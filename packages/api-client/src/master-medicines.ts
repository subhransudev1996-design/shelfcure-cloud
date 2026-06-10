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
