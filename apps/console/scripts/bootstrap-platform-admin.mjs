// One-off bootstrap script — creates the FIRST platform admin directly via the
// service role key. After this, every subsequent platform admin is created
// through the app (Console → Platform Admins → Add platform admin), which
// goes through the create-platform-admin Edge Function instead.
//
// Usage: node scripts/bootstrap-platform-admin.mjs <email> <password> <full_name>
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.

import { createClient } from '@supabase/supabase-js';

const [email, password, fullName] = process.argv.slice(2);
if (!email || !password || !fullName) {
  console.error('Usage: node scripts/bootstrap-platform-admin.mjs <email> <password> <full_name>');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName, platform_admin: true },
});

if (createErr || !created?.user) {
  console.error('auth.admin.createUser failed:', createErr?.message ?? 'unknown error');
  process.exit(1);
}

const { error: insertErr } = await admin
  .from('platform_admins')
  .insert({ id: created.user.id, full_name: fullName, email });

if (insertErr) {
  console.error('platform_admins insert failed, rolling back auth user:', insertErr.message);
  await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
  process.exit(1);
}

console.log('Bootstrapped platform admin:', created.user.id, email);
