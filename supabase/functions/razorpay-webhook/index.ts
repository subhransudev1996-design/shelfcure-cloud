// razorpay-webhook Edge Function
// ---------------------------------------------------------------------------
// PUBLIC endpoint — Razorpay calls this directly, server-to-server. There is
// no Supabase JWT, no auth.uid(), nothing to check is_platform_admin()
// against. The only authentication is Razorpay's HMAC-SHA256 signature
// (X-Razorpay-Signature header) over the raw request body, verified against
// RAZORPAY_WEBHOOK_SECRET. Fails closed: if the secret isn't configured yet,
// or the signature doesn't match, every request is rejected with 400.
//
// Once verified, writes go through the SERVICE-ROLE client directly (no RPC —
// there's no caller identity for an RPC's is_platform_admin() check to mean
// anything here), the same mechanism the one-off bootstrap scripts use.
//
// Always returns 200 once the signature is valid, even if an individual
// event can't be matched to an org — logs and moves on. A 4xx/5xx response
// makes Razorpay retry indefinitely, which is the wrong failure mode for
// "we don't recognize this subscription."
//
// NOTE: exact webhook payload nesting (payload.payment.entity vs
// payload.subscription.entity) is written against Razorpay's documented
// webhook shape. Per the Phase 4 plan, this should be confirmed against a
// real test-mode webhook event once the webhook URL + secret are configured
// — flag any mismatch then, don't guess further now.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RAZORPAY_WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function verifySignature(rawBody: string, signatureHex: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signatureBytes = hexToBytes(signatureHex);
  if (!signatureBytes) return false;
  return crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(rawBody));
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('razorpay-webhook unhandled error:', msg);
    // Still 200 — an internal error on our side shouldn't make Razorpay
    // retry forever for an event it already delivered successfully.
    return jsonResponse({ ok: false, error: 'internal_error' }, 200);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  if (!RAZORPAY_WEBHOOK_SECRET) {
    return jsonResponse({ error: 'webhook_secret_not_configured' }, 400);
  }

  const signature = req.headers.get('X-Razorpay-Signature');
  if (!signature) return jsonResponse({ error: 'missing_signature' }, 400);

  const rawBody = await req.text();
  const valid = await verifySignature(rawBody, signature, RAZORPAY_WEBHOOK_SECRET);
  if (!valid) return jsonResponse({ error: 'invalid_signature' }, 400);

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const event: string = body?.event ?? '';
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const subscriptionEntity = body?.payload?.subscription?.entity;
  const paymentEntity = body?.payload?.payment?.entity;
  const subscriptionId: string | undefined = subscriptionEntity?.id ?? paymentEntity?.subscription_id;

  if (!subscriptionId) {
    console.warn('razorpay-webhook: no subscription id on event', event);
    return jsonResponse({ ok: true, skipped: 'no_subscription_id' });
  }

  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('razorpay_subscription_id', subscriptionId)
    .maybeSingle();

  if (!org) {
    console.warn('razorpay-webhook: no org matches subscription', subscriptionId, event);
    return jsonResponse({ ok: true, skipped: 'org_not_found' });
  }

  switch (event) {
    case 'subscription.activated':
      await admin.from('organizations').update({ billing_status: 'active' }).eq('id', org.id);
      break;
    case 'subscription.cancelled':
    case 'subscription.completed':
      await admin.from('organizations').update({ billing_status: 'cancelled' }).eq('id', org.id);
      break;
    case 'payment.failed':
      await admin.from('organizations').update({ billing_status: 'past_due' }).eq('id', org.id);
      break;
    case 'subscription.charged':
    case 'payment.captured': {
      await admin.from('organizations').update({ billing_status: 'active' }).eq('id', org.id);
      if (paymentEntity?.id && typeof paymentEntity.amount === 'number') {
        // Plan amounts are tax-inclusive at the Razorpay level (ADR-0017:
        // exclusive pricing + 18% GST collected together); decompose here for
        // the invoice record. CGST/SGST-vs-IGST split deferred — see Phase 4
        // plan's "known gaps."
        const total = paymentEntity.amount as number;
        const subtotal = Math.round(total / 1.18);
        const gst = total - subtotal;
        await admin
          .from('billing_invoices')
          .upsert(
            {
              org_id: org.id,
              razorpay_payment_id: paymentEntity.id,
              razorpay_subscription_id: subscriptionId,
              amount_subtotal_paise: subtotal,
              gst_paise: gst,
              total_paise: total,
              status: 'captured',
            },
            { onConflict: 'razorpay_payment_id', ignoreDuplicates: true },
          );
      }
      break;
    }
    default:
      console.log('razorpay-webhook: unhandled event type', event);
  }

  return jsonResponse({ ok: true });
}
