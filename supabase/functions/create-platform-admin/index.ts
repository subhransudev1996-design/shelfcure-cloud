// create-platform-admin Edge Function
// ---------------------------------------------------------------------------
// Same shape as create-staff (see that function's header comment for the full
// rationale). The differences here: the caller must already be a platform
// admin (checked inside rpc_console_finalize_platform_admin, not in JS), and
// there's no role/store_id payload — every platform admin has equal access
// (ADR-0018).
//
//   1. Browser calls this function with the caller's JWT and {email, password, full_name}.
//   2. We verify the JWT (via a user-scoped client).
//   3. We call admin.createUser to create the auth row.
//   4. We call rpc_console_finalize_platform_admin (as the caller) to insert
//      the platform_admins row — the is_platform_admin() permission check
//      happens there, in Postgres.
//   5. If step 4 fails after step 3 succeeded, we roll back by deleting the
//      auth user so we don't leave orphans.

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

interface CreatePlatformAdminInput {
  email: string;
  password: string;
  full_name: string;
}

function validate(input: any): CreatePlatformAdminInput | string {
  if (!input || typeof input !== 'object') return 'invalid_payload';
  const { email, password, full_name } = input;
  if (typeof email !== 'string' || !email.includes('@')) return 'invalid_email';
  if (typeof password !== 'string' || password.length < 8) return 'password_min_8_chars';
  if (typeof full_name !== 'string' || full_name.trim().length < 2) return 'invalid_full_name';
  return {
    email: email.trim().toLowerCase(),
    password,
    full_name: full_name.trim(),
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
    user_metadata: { full_name: parsed.full_name, platform_admin: true },
  });

  if (created.error || !created.data?.user) {
    const msg = created.error?.message ?? 'create_user_failed';
    return jsonResponse({ error: msg }, 400);
  }

  const newUserId = created.data.user.id;

  // Step 2 — finalize the platform_admins row via RPC running as the caller
  // (is_platform_admin() permission check happens in SQL).
  const { data: admin, error: rpcErr } = await userClient.rpc('rpc_console_finalize_platform_admin', {
    p_user_id: newUserId,
    p_email: parsed.email,
    p_full_name: parsed.full_name,
  });

  if (rpcErr) {
    // Roll back the auth user so we don't leave orphans.
    await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
    return jsonResponse({ error: rpcErr.message, code: rpcErr.code }, 400);
  }

  return jsonResponse({ ok: true, admin: Array.isArray(admin) ? admin[0] : admin });
}
