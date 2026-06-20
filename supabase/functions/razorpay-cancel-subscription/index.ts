// razorpay-cancel-subscription Edge Function
// ---------------------------------------------------------------------------
// Verifies the caller is a platform admin, cancels the org's subscription in
// Razorpay, then sets billing_status='cancelled' via the existing Phase 3
// rpc_console_update_org_license — no new persistence RPC needed for this
// half, that RPC already does exactly this.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID');
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');

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

function razorpayAuthHeader(): string {
  return 'Basic ' + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
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

  const { data: isAdmin, error: adminCheckErr } = await userClient.rpc('is_platform_admin');
  if (adminCheckErr || !isAdmin) return jsonResponse({ error: 'permission_denied' }, 403);

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return jsonResponse({ error: 'razorpay_not_configured' }, 400);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const orgId = payload?.org_id;
  if (typeof orgId !== 'string') return jsonResponse({ error: 'invalid_payload' }, 400);

  const { data: orgDetail, error: orgErr } = await userClient.rpc('rpc_console_get_org_detail', {
    p_org_id: orgId,
  });
  if (orgErr) return jsonResponse({ error: orgErr.message, code: orgErr.code }, 400);
  const subscriptionId = (orgDetail as any)?.org?.razorpay_subscription_id;
  if (!subscriptionId) return jsonResponse({ error: 'no_active_subscription' }, 400);

  const cancelRes = await fetch(
    `https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`,
    {
      method: 'POST',
      headers: { Authorization: razorpayAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancel_at_cycle_end: 0 }),
    },
  );
  const cancelBody = await cancelRes.json();
  if (!cancelRes.ok) {
    return jsonResponse({ error: cancelBody?.error?.description ?? 'razorpay_cancel_failed' }, 400);
  }

  const { error: licenseErr } = await userClient.rpc('rpc_console_update_org_license', {
    p_org_id: orgId,
    p_payload: { billing_status: 'cancelled' },
  });
  if (licenseErr) return jsonResponse({ error: licenseErr.message, code: licenseErr.code }, 400);

  return jsonResponse({ ok: true });
}
