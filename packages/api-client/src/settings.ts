import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

export interface UpdateOrgInput {
  name?: string;
  legal_name?: string | null;
  gstin_default?: string | null;
  shared_masters_enabled?: boolean;
  upi_id?: string | null;
}

export async function updateOrgSettings(client: Client, input: UpdateOrgInput) {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.legal_name !== undefined) payload.legal_name = input.legal_name?.trim() ?? null;
  if (input.gstin_default !== undefined) payload.gstin_default = input.gstin_default?.trim().toUpperCase() || null;
  if (input.shared_masters_enabled !== undefined) payload.shared_masters_enabled = input.shared_masters_enabled;
  if (input.upi_id !== undefined) payload.upi_id = input.upi_id?.trim() || null;

  const { data, error } = await client.rpc('rpc_update_org_settings', { p_payload: payload as never });
  if (error) throw mapSupabaseError(error);
  return data;
}

export interface UpdateStoreInput {
  name?: string;
  gstin?: string | null;
  drug_license_no?: string | null;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  owner_name?: string;
  gst_scheme?: 'regular' | 'composition' | 'unregistered';
  gst_filing_type?: 'monthly' | 'quarterly';
  idle_lock_minutes?: number;
  is_active?: boolean;
  enable_gst_calculation?: boolean;
  upi_id?: string | null;
  logo_url?: string | null;
  near_expiry_alert_days?: number;
  low_stock_threshold?: number;
}

export async function updateStoreSettings(client: Client, storeId: string, input: UpdateStoreInput) {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) payload[k] = typeof v === 'string' ? v.trim() : v;
  }
  if (typeof payload.gstin === 'string') payload.gstin = (payload.gstin as string).toUpperCase() || null;
  const { data, error } = await client.rpc('rpc_update_store_settings', {
    p_store_id: storeId,
    p_payload: payload as never,
  });
  if (error) throw mapSupabaseError(error);
  return data;
}

export interface UpdateProfileInput {
  full_name?: string;
  phone?: string | null;
}

export async function updateMyProfile(client: Client, input: UpdateProfileInput) {
  const payload: Record<string, unknown> = {};
  if (input.full_name !== undefined) payload.full_name = input.full_name.trim();
  if (input.phone !== undefined) payload.phone = input.phone?.trim() || null;
  const { data, error } = await client.rpc('rpc_update_my_profile', { p_payload: payload as never });
  if (error) throw mapSupabaseError(error);
  return data;
}
