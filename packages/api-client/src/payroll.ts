import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';
import { EXPENSE_PAYMENT_METHODS } from './finance';

type Client = SupabaseClient<Database>;
export type SalaryPaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

export interface SalaryPayment {
  id: string;
  user_profile_id: string;
  staff_name: string;
  role: string;
  store_code: string | null;
  amount: number;
  payment_date: string;
  payment_method: SalaryPaymentMethod | null;
  notes: string | null;
  paid_by_name: string;
  created_at: string;
}

export interface RecordSalaryPaymentInput {
  user_profile_id: string;
  amount: number;
  payment_date: string;
  store_id?: string | null;
  payment_method?: SalaryPaymentMethod;
  notes?: string | null;
  clientUuid?: string;
}

/**
 * Records a salary payment AND its paired `expenses` row (category Salaries)
 * in one atomic RPC, so Finance reports stay accurate with no double-entry.
 * super_admin-only — refuses self-payment and payments to other super_admin
 * rows. Idempotent: pass the same `clientUuid` on a retried submit.
 */
export async function recordSalaryPayment(
  client: Client,
  input: RecordSalaryPaymentInput,
): Promise<{ id: string; expense_id: string }> {
  const { data, error } = await client.rpc('rpc_record_salary_payment', {
    p_user_id: input.user_profile_id,
    p_amount: input.amount,
    p_payment_date: input.payment_date,
    p_store_id: input.store_id ?? null,
    p_payment_method: input.payment_method ?? 'bank_transfer',
    p_notes: input.notes?.trim() || null,
    p_client_uuid: input.clientUuid ?? null,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as { id: string; expense_id: string };
}

export async function listSalaryPayments(client: Client, limit = 200): Promise<SalaryPayment[]> {
  const { data, error } = await client.rpc('rpc_list_salary_payments', { p_limit: limit });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as SalaryPayment[];
}
