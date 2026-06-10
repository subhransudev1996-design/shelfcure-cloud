import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError, DomainError } from './errors';

type Client = SupabaseClient<Database>;

export type StaffRole = 'super_admin' | 'store_admin' | 'pharmacist' | 'cashier' | 'accountant';

export interface StaffRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  store_id: string | null;
  store_code: string | null;
  store_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export async function listStaff(client: Client): Promise<StaffRow[]> {
  const { data, error } = await client.rpc('rpc_list_staff');
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as StaffRow[];
}

export interface CreateStaffInput {
  email: string;
  password: string;
  full_name: string;
  role: Exclude<StaffRole, 'super_admin'>;
  store_id?: string | null;
  phone?: string | null;
}

export interface CreatedStaff {
  id: string;
  full_name: string;
  email: string;
  role: StaffRole;
  store_id: string | null;
}

/**
 * Create a staff user. Goes through the create-staff Edge Function because
 * creating an auth.users row with an admin-chosen password requires the
 * service role key (never shipped to the browser).
 */
export async function createStaff(client: Client, input: CreateStaffInput): Promise<CreatedStaff> {
  const { data, error } = await client.functions.invoke('create-staff', {
    body: {
      email: input.email.trim().toLowerCase(),
      password: input.password,
      full_name: input.full_name.trim(),
      role: input.role,
      store_id: input.role === 'accountant' ? null : (input.store_id ?? null),
      phone: input.phone?.trim() || null,
    },
  });

  // If the function returned non-2xx, supabase-js sets `error` but ALSO returns
  // the response body in `error.context`. We want the real server message, not
  // the generic "Edge Function returned a non-2xx status code".
  if (error) {
    let serverMessage: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body && typeof body === 'object' && typeof body.error === 'string') {
          serverMessage = body.error;
        }
      }
    } catch {
      // ignore — fall back to generic mapping
    }
    if (serverMessage) {
      throw new DomainError('validation_failed', humanizeError(serverMessage));
    }
    throw mapSupabaseError(error);
  }

  // Edge function returns { ok, profile } on success; { error, code? } on failure.
  if (data?.error) {
    throw new DomainError('validation_failed', humanizeError(data.error));
  }
  if (!data?.profile) {
    throw new DomainError('unknown', 'Staff creation returned no profile');
  }
  return data.profile as CreatedStaff;
}

function humanizeError(code: string): string {
  switch (code) {
    case 'password_min_8_chars':
      return 'Password must be at least 8 characters';
    case 'invalid_email':
      return 'Please enter a valid email address';
    case 'invalid_full_name':
      return 'Please enter a full name (at least 2 characters)';
    case 'store_required_for_role':
      return 'Pick a store for this staff member';
    case 'invalid_role':
      return 'Pick a valid role';
    case 'profile_already_exists':
      return 'A profile for this user already exists';
    case 'invalid_token':
    case 'missing_authorization':
      return 'You are not signed in';
    case 'create_user_failed':
      return 'Could not create the user — check the email is not already in use';
    default:
      if (code.startsWith('permission_denied')) return code;
      if (code.includes('already been registered') || code.includes('already exists'))
        return 'A user with this email already exists';
      return code;
  }
}
