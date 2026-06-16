import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

export interface Doctor {
  id: string;
  name: string;
  specialization: string | null;
  phone: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
  commission_type: 'percentage' | 'fixed';
  commission_rate: number;
  is_active: boolean;
}

export interface CreateDoctorInput {
  name: string;
  specialization?: string;
  phone?: string;
  clinic_name?: string;
  clinic_address?: string;
  store_id?: string | null;
  commission_type?: 'percentage' | 'fixed';
  commission_rate?: number;
}

export interface UpdateDoctorInput {
  name?: string;
  specialization?: string;
  phone?: string;
  clinic_name?: string;
  clinic_address?: string;
  commission_type?: 'percentage' | 'fixed';
  commission_rate?: number;
  is_active?: boolean;
}

export interface DoctorStats {
  referred_sales_count: number;
  total_revenue: number;
  commission_earned: number;
  commission_paid: number;
  commission_balance: number;
}

export interface DoctorDetail {
  doctor: Doctor;
  stats: DoctorStats;
}

export interface DoctorSaleRow {
  sale_id: string;
  bill_number: string;
  bill_date: string;
  customer_name: string;
  total_amount: number;
  commission_amount: number;
}

export interface DoctorCommissionPayout {
  id: string;
  amount: number;
  notes: string | null;
  paid_at: string;
  paid_by_name: string;
  created_at: string;
}

export async function listDoctors(
  client: Client,
  opts?: { storeId?: string | null; includeInactive?: boolean },
): Promise<Doctor[]> {
  const { data, error } = await client.rpc('rpc_list_doctors', {
    p_store_id: opts?.storeId ?? undefined,
    p_include_inactive: opts?.includeInactive ?? false,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Doctor[];
}

export async function createDoctor(client: Client, input: CreateDoctorInput): Promise<Doctor> {
  const payload = {
    name: input.name.trim(),
    specialization: input.specialization?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    clinic_name: input.clinic_name?.trim() || undefined,
    clinic_address: input.clinic_address?.trim() || undefined,
    store_id: input.store_id ?? undefined,
    commission_type: input.commission_type ?? 'percentage',
    commission_rate: input.commission_rate ?? 0,
  };
  const { data, error } = await client.rpc('rpc_create_doctor', { p_payload: payload as never });
  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw mapSupabaseError(new Error('rpc_create_doctor returned no row'));
  return row as Doctor;
}

export async function updateDoctor(
  client: Client,
  doctorId: string,
  input: UpdateDoctorInput,
): Promise<Doctor> {
  const { data, error } = await client.rpc('rpc_update_doctor', {
    p_doctor_id: doctorId,
    p_payload: input as never,
  });
  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw mapSupabaseError(new Error('rpc_update_doctor returned no row'));
  return row as Doctor;
}

export async function getDoctorDetail(client: Client, doctorId: string): Promise<DoctorDetail> {
  const { data, error } = await client.rpc('rpc_get_doctor_detail', { p_doctor_id: doctorId });
  if (error) throw mapSupabaseError(error);
  return data as unknown as DoctorDetail;
}

export async function getDoctorSales(
  client: Client,
  doctorId: string,
  opts?: { from?: string; to?: string; limit?: number; offset?: number },
): Promise<DoctorSaleRow[]> {
  const { data, error } = await client.rpc('rpc_get_doctor_sales', {
    p_doctor_id: doctorId,
    p_from: opts?.from ?? undefined,
    p_to: opts?.to ?? undefined,
    p_limit: opts?.limit ?? 100,
    p_offset: opts?.offset ?? 0,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as DoctorSaleRow[];
}

export async function recordDoctorCommissionPayout(
  client: Client,
  payload: { doctor_id: string; amount: number; notes?: string; paid_at?: string },
): Promise<{ id: string; amount: number; commission_balance: number }> {
  const { data, error } = await client.rpc('rpc_record_doctor_commission_payout', {
    p_payload: payload as never,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as { id: string; amount: number; commission_balance: number };
}

export async function getDoctorCommissionPayouts(
  client: Client,
  doctorId: string,
  limit = 50,
): Promise<DoctorCommissionPayout[]> {
  const { data, error } = await client.rpc('rpc_get_doctor_commission_payouts', {
    p_doctor_id: doctorId,
    p_limit: limit,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as DoctorCommissionPayout[];
}
