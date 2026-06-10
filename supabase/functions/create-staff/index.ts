// create-staff Edge Function
// ---------------------------------------------------------------------------
// Why an Edge Function?
//   Creating an auth.users row with a chosen email + password requires the
//   Supabase Admin API (auth.admin.createUser), which only accepts the
//   service_role key. That key must NEVER touch the browser. So:
//
//     1. Browser calls this function with the caller's JWT and the staff payload.
//     2. We verify the JWT (via a user-scoped client) and read the caller's role.
//     3. If the caller is super_admin (or store_admin creating in-scope staff),
//        we call admin.createUser to create the auth row.
//     4. We then call rpc_finalize_staff_profile to insert the user_profiles row
//        in the database — keeping the role/scope rules in Postgres where every
//        other RPC enforces them.
//     5. If step 4 fails after step 3 succeeded, we roll back by deleting the
//        auth user so we don't leave orphans.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

interface CreateStaffInput {
  email: string;
  password: string;
  full_name: string;
  role: 'store_admin' | 'pharmacist' | 'cashier' | 'accountant';
  store_id?: string | null;
  phone?: string | null;
}

function validate(input: any): CreateStaffInput | string {
  if (!input || typeof input !== 'object') return 'invalid_payload';
  const { email, password, full_name, role, store_id, phone } = input;
  if (typeof email !== 'string' || !email.includes('@')) return 'invalid_email';
  if (typeof password !== 'string' || password.length < 8) return 'password_min_8_chars';
  if (typeof full_name !== 'string' || full_name.trim().length < 2) return 'invalid_full_name';
  if (!['store_admin', 'pharmacist', 'cashier', 'accountant'].includes(role)) return 'invalid_role';
  if (role !== 'accountant' && !store_id) return 'store_required_for_role';
  return {
    email: email.trim().toLowerCase(),
    password,
    full_name: full_name.trim(),
    role,
    store_id: role === 'accountant' ? null : (store_id ?? null),
    phone: phone ? String(phone).trim() : null,
  };
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `unhandled: ${msg}` }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'missing_authorization' }, 401);
  }

  // User-scoped client: verifies the JWT and lets us run RPCs as the caller.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const parsed = validate(payload);
  if (typeof parsed === 'string') return jsonResponse({ error: parsed }, 400);

  // Service-role client: needed for auth.admin.createUser.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Step 1 — create the auth user with email_confirm so they can sign in immediately.
  const created = await adminClient.auth.admin.createUser({
    email: parsed.email,
    password: parsed.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.full_name, role: parsed.role },
  });

  if (created.error || !created.data?.user) {
    const msg = created.error?.message ?? 'create_user_failed';
    return jsonResponse({ error: msg }, 400);
  }

  const newUserId = created.data.user.id;

  // Step 2 — finalize profile via RPC running as the caller (role/scope checks in SQL).
  const { data: profile, error: rpcErr } = await userClient.rpc('rpc_finalize_staff_profile', {
    p_user_id: newUserId,
    p_email: parsed.email,
    p_full_name: parsed.full_name,
    p_role: parsed.role,
    p_store_id: parsed.store_id,
    p_phone: parsed.phone,
  });

  if (rpcErr) {
    // Roll back the auth user so we don't leave orphans.
    await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
    return jsonResponse({ error: rpcErr.message, code: rpcErr.code }, 400);
  }

  return jsonResponse({ ok: true, profile: Array.isArray(profile) ? profile[0] : profile });
}
