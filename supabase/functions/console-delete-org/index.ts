// console-delete-org Edge Function
// ---------------------------------------------------------------------------
// Same shape as create-org-with-owner (see that function's header comment for
// the full rationale). Here the action is the reverse: a platform admin
// permanently deleting an organization (ADR-0018 Console extension).
//
//   1. Browser calls this function with the caller's JWT + org id + the
//      typed confirmation text.
//   2. We verify the JWT (via a user-scoped client).
//   3. We call rpc_console_delete_organization (as the caller) — the
//      is_platform_admin() check and the name-confirmation check both happen
//      there, in Postgres, along with the actual cascading delete across
//      every business table. It returns the auth.users ids of the org's
//      former staff.
//   4. Postgres cannot delete auth.users rows (needs the service role), so we
//      do that here, one admin.deleteUser call per id, with the service-role
//      client. Any id that fails to delete is reported back but does not
//      undo the (already-irreversible) database deletion — there's nothing
//      to roll back to.

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

interface DeleteOrgInput {
  org_id: string;
  confirm_name: string;
}

function validate(input: any): DeleteOrgInput | string {
  if (!input || typeof input !== 'object') return 'invalid_payload';
  const { org_id, confirm_name } = input;
  if (typeof org_id !== 'string' || !org_id) return 'invalid_org_id';
  if (typeof confirm_name !== 'string' || !confirm_name.trim()) return 'invalid_confirm_name';
  return { org_id, confirm_name };
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

  // Step 1 — the actual cascading delete, running as the caller so
  // is_platform_admin() and the name-confirmation check happen in Postgres.
  const { data: result, error: rpcErr } = await userClient.rpc('rpc_console_delete_organization', {
    p_org_id: parsed.org_id,
    p_confirm_name: parsed.confirm_name,
  });

  if (rpcErr) {
    return jsonResponse({ error: rpcErr.message, code: rpcErr.code }, 400);
  }

  const userIds: string[] = (result as any)?.deleted_user_ids ?? [];

  // Step 2 — remove the former staff's auth.users rows. Needs the service
  // role; the database rows are already gone at this point regardless.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const failedUserIds: string[] = [];
  for (const userId of userIds) {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) failedUserIds.push(userId);
  }

  return jsonResponse({
    ok: true,
    org_id: parsed.org_id,
    deleted_user_count: userIds.length - failedUserIds.length,
    failed_user_ids: failedUserIds,
  });
}
