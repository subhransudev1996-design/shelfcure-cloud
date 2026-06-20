// create-org-with-owner Edge Function
// ---------------------------------------------------------------------------
// Same shape as create-platform-admin (see that function's header comment for
// the full rationale). Here the caller is a platform admin hand-creating a
// new organization + its owner account for sales-assisted onboarding
// (ADR-0018 Phase 2) — the owner themselves never touches this flow.
//
//   1. Browser calls this function with the caller's JWT + org/owner payload.
//   2. We verify the JWT (via a user-scoped client).
//   3. We call admin.createUser to create the owner's auth row.
//   4. We call rpc_console_create_org (as the caller) to insert the
//      organizations + user_profiles rows — the is_platform_admin() check
//      happens there, in Postgres.
//   5. If step 4 fails after step 3 succeeded, we roll back by deleting the
//      auth user so we don't leave orphans.
//   6. Optional `license` field (ADR-0018 dynamic tiers extension): picks a
//      dynamic billing_tier_id (or none, for an ungoverned org).
//      { mode: 'trial', billing_tier_id, trial_days } controls the initial
//      trial length (falls back to the tier's own trial_days, then 14);
//      { mode: 'paid', billing_tier_id, ... } activates a paid license
//      immediately via rpc_console_record_manual_payment — for when a rep
//      signs someone up and collects cash on the spot.

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

type LicenseInput =
  | { mode: 'trial'; billing_tier_id: string | null; trial_days: number | null }
  | {
      mode: 'paid';
      billing_tier_id: string;
      billing_cycle: 'monthly' | 'yearly';
      amount_paise: number;
      payment_method: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque';
      notes?: string | null;
    };

interface CreateOrgInput {
  org_name: string;
  owner_full_name: string;
  owner_email: string;
  owner_password: string;
  owner_phone: string | null;
  license: LicenseInput | null;
}

function validateLicense(input: any): LicenseInput | null | string {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'object') return 'invalid_license';
  if (input.mode === 'trial') {
    const tierId = input.billing_tier_id ? String(input.billing_tier_id) : null;
    let days: number | null = null;
    if (input.trial_days !== undefined && input.trial_days !== null) {
      days = Number(input.trial_days);
      if (!Number.isFinite(days) || days < 0) return 'invalid_trial_days';
    }
    return { mode: 'trial', billing_tier_id: tierId, trial_days: days };
  }
  if (input.mode === 'paid') {
    if (typeof input.billing_tier_id !== 'string' || !input.billing_tier_id) return 'invalid_billing_tier';
    if (!['monthly', 'yearly'].includes(input.billing_cycle)) return 'invalid_billing_cycle';
    const amount = Number(input.amount_paise);
    if (!Number.isFinite(amount) || amount <= 0) return 'invalid_amount';
    if (!['cash', 'upi', 'card', 'bank_transfer', 'cheque'].includes(input.payment_method)) {
      return 'invalid_payment_method';
    }
    return {
      mode: 'paid',
      billing_tier_id: input.billing_tier_id,
      billing_cycle: input.billing_cycle,
      amount_paise: amount,
      payment_method: input.payment_method,
      notes: input.notes ? String(input.notes).trim() : null,
    };
  }
  return 'invalid_license';
}

function validate(input: any): CreateOrgInput | string {
  if (!input || typeof input !== 'object') return 'invalid_payload';
  const { org_name, owner_full_name, owner_email, owner_password, owner_phone, license } = input;
  if (typeof org_name !== 'string' || org_name.trim().length < 2) return 'invalid_org_name';
  if (typeof owner_full_name !== 'string' || owner_full_name.trim().length < 2) return 'invalid_full_name';
  if (typeof owner_email !== 'string' || !owner_email.includes('@')) return 'invalid_email';
  if (typeof owner_password !== 'string' || owner_password.length < 8) return 'password_min_8_chars';
  const parsedLicense = validateLicense(license);
  if (typeof parsedLicense === 'string') return parsedLicense;
  return {
    org_name: org_name.trim(),
    owner_full_name: owner_full_name.trim(),
    owner_email: owner_email.trim().toLowerCase(),
    owner_password,
    owner_phone: owner_phone ? String(owner_phone).trim() : null,
    license: parsedLicense,
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

  // Step 1 — create the owner's auth user with email_confirm so they can sign in immediately.
  const created = await adminClient.auth.admin.createUser({
    email: parsed.owner_email,
    password: parsed.owner_password,
    email_confirm: true,
    user_metadata: { full_name: parsed.owner_full_name, role: 'super_admin' },
  });

  if (created.error || !created.data?.user) {
    const msg = created.error?.message ?? 'create_user_failed';
    return jsonResponse({ error: msg }, 400);
  }

  const newUserId = created.data.user.id;

  // Step 2 — create the org + owner profile via RPC running as the caller
  // (is_platform_admin() permission check happens in SQL).
  const { data: org, error: rpcErr } = await userClient.rpc('rpc_console_create_org', {
    p_owner_user_id: newUserId,
    p_org_name: parsed.org_name,
    p_owner_full_name: parsed.owner_full_name,
    p_owner_email: parsed.owner_email,
    p_owner_phone: parsed.owner_phone,
    p_billing_tier_id:
      parsed.license?.mode === 'trial' ? parsed.license.billing_tier_id
      : parsed.license?.mode === 'paid' ? parsed.license.billing_tier_id
      : null,
    p_trial_days: parsed.license?.mode === 'trial' ? parsed.license.trial_days : null,
  });

  if (rpcErr) {
    // Roll back the auth user so we don't leave orphans.
    await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
    return jsonResponse({ error: rpcErr.message, code: rpcErr.code }, 400);
  }

  // Step 3 — if the platform admin collected a paid license on the spot
  // (field-sales cash deal), activate it immediately instead of leaving the
  // org on trial.
  if (parsed.license?.mode === 'paid') {
    const orgId = (org as any)?.org_id;
    const { error: paymentErr } = await userClient.rpc('rpc_console_record_manual_payment', {
      p_org_id: orgId,
      p_billing_tier_id: parsed.license.billing_tier_id,
      p_billing_cycle: parsed.license.billing_cycle,
      p_amount_paise: parsed.license.amount_paise,
      p_payment_method: parsed.license.payment_method,
      p_notes: parsed.license.notes,
    });
    if (paymentErr) {
      return jsonResponse(
        { error: `org_created_but_payment_failed: ${paymentErr.message}`, code: paymentErr.code, org },
        400,
      );
    }
  }

  return jsonResponse({ ok: true, org });
}
