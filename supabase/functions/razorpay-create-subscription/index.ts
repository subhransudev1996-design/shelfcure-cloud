// razorpay-create-subscription Edge Function
// ---------------------------------------------------------------------------
// Same "external API call -> SECURITY DEFINER RPC persists" shape as
// create-staff/create-platform-admin/create-org-with-owner, just calling
// Razorpay's REST API instead of Supabase's Admin API.
//
//   1. Browser calls this function with the caller's JWT + {org_id, billing_tier_id, billing_cycle}.
//   2. We verify the JWT and that the caller is a platform admin.
//   3. We look up the org (for name/owner email/phone) and the chosen tier's
//      razorpay_plan_id_monthly/yearly via existing platform-admin-gated RPCs.
//   4. We create (or reuse) a Razorpay Customer, then create a Razorpay
//      Subscription against the plan.
//   5. We persist the resulting ids via rpc_console_save_subscription (as the
//      caller, so the permission check stays in Postgres).
//   6. We return the subscription's short_url (Razorpay's hosted checkout
//      page) for the platform admin to share with the org owner.
//
// NOTE: the exact Razorpay request/response shape here is written against
// Razorpay's documented Customers/Subscriptions API. Per the Phase 4 plan,
// this should be smoke-tested against the real API once credentials are
// confirmed working — flag any field mismatch then, don't guess further now.

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
  const billingTierId = payload?.billing_tier_id;
  const billingCycle = payload?.billing_cycle ?? 'monthly';
  if (typeof orgId !== 'string' || typeof billingTierId !== 'string') {
    return jsonResponse({ error: 'invalid_payload' }, 400);
  }
  if (!['monthly', 'yearly'].includes(billingCycle)) {
    return jsonResponse({ error: 'invalid_billing_cycle' }, 400);
  }

  // Resolve the tier's razorpay_plan_id for the requested cycle.
  const { data: tiers, error: tiersErr } = await userClient.rpc('rpc_console_list_billing_tiers');
  if (tiersErr) return jsonResponse({ error: tiersErr.message, code: tiersErr.code }, 400);
  const tier = (tiers as any[] | null)?.find((t) => t.id === billingTierId);
  if (!tier) return jsonResponse({ error: 'not_found: billing tier' }, 400);
  const razorpayPlanId = billingCycle === 'yearly' ? tier.razorpay_plan_id_yearly : tier.razorpay_plan_id_monthly;
  if (!razorpayPlanId) {
    return jsonResponse({ error: 'plan_not_configured' }, 400);
  }

  // Resolve the org + its owner's contact details for the Razorpay customer.
  const { data: orgDetail, error: orgErr } = await userClient.rpc('rpc_console_get_org_detail', {
    p_org_id: orgId,
  });
  if (orgErr) return jsonResponse({ error: orgErr.message, code: orgErr.code }, 400);
  const org = (orgDetail as any)?.org;
  const owner = ((orgDetail as any)?.staff ?? []).find((s: any) => s.role === 'super_admin');
  if (!org || !owner) return jsonResponse({ error: 'org_or_owner_missing' }, 400);

  // Step 1 — create (or reuse) the Razorpay Customer.
  let razorpayCustomerId: string = org.razorpay_customer_id;
  if (!razorpayCustomerId) {
    const customerRes = await fetch('https://api.razorpay.com/v1/customers', {
      method: 'POST',
      headers: { Authorization: razorpayAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: owner.full_name,
        email: owner.email,
        contact: owner.phone ?? undefined,
        fail_existing: 0,
        notes: { org_id: orgId, org_name: org.name },
      }),
    });
    const customerBody = await customerRes.json();
    if (!customerRes.ok) {
      return jsonResponse({ error: customerBody?.error?.description ?? 'razorpay_customer_failed' }, 400);
    }
    razorpayCustomerId = customerBody.id;
  }

  // Step 2 — create the Subscription. total_count is large (effectively
  // open-ended monthly billing); cancellation is explicit via the cancel API.
  const subRes = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: { Authorization: razorpayAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: razorpayPlanId,
      customer_id: razorpayCustomerId,
      total_count: 1200,
      customer_notify: 1,
      notes: { org_id: orgId, org_name: org.name },
    }),
  });
  const subBody = await subRes.json();
  if (!subRes.ok) {
    return jsonResponse({ error: subBody?.error?.description ?? 'razorpay_subscription_failed' }, 400);
  }

  // Step 3 — persist as the caller (is_platform_admin() check happens in SQL).
  const { error: saveErr } = await userClient.rpc('rpc_console_save_subscription', {
    p_org_id: orgId,
    p_razorpay_customer_id: razorpayCustomerId,
    p_razorpay_subscription_id: subBody.id,
  });
  if (saveErr) return jsonResponse({ error: saveErr.message, code: saveErr.code }, 400);

  return jsonResponse({ ok: true, short_url: subBody.short_url, subscription_id: subBody.id });
}
