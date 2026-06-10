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
  is_active: boolean;
}

export async function listDoctors(client: Client, storeId?: string | null): Promise<Doctor[]> {
  const { data, error } = await client.rpc('rpc_list_doctors', {
    p_store_id: storeId ?? undefined,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Doctor[];
}

export interface CreateDoctorInput {
  name: string;
  specialization?: string;
  phone?: string;
  clinic_name?: string;
  clinic_address?: string;
  store_id?: string | null;
}

export async function createDoctor(client: Client, input: CreateDoctorInput): Promise<Doctor> {
  const payload = {
    name: input.name.trim(),
    specialization: input.specialization?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    clinic_name: input.clinic_name?.trim() || undefined,
    clinic_address: input.clinic_address?.trim() || undefined,
    store_id: input.store_id ?? undefined,
  };
  const { data, error } = await client.rpc('rpc_create_doctor', { p_payload: payload as never });
  if (error) throw mapSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw mapSupabaseError(new Error('rpc_create_doctor returned no row'));
  return row as Doctor;
}
