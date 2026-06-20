// console-settings-status Edge Function
// ---------------------------------------------------------------------------
// Read-only status check for Console's Settings -> Integrations page.
// Deliberately never returns actual secret values — only whether each one is
// configured. Credentials stay CLI-managed (`supabase secrets set`), never
// stored in the DB or sent to the browser; this endpoint exists purely so a
// platform admin can see what's missing without needing CLI/dashboard access.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
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

  return jsonResponse({
    razorpay_configured: Boolean(Deno.env.get('RAZORPAY_KEY_ID')) && Boolean(Deno.env.get('RAZORPAY_KEY_SECRET')),
    razorpay_webhook_configured: Boolean(Deno.env.get('RAZORPAY_WEBHOOK_SECRET')),
  });
}
