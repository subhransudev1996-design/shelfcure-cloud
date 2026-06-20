// One-off / re-runnable sync script — for every active billing_tiers row with
// a monthly_price_paise and/or yearly_price_paise set, creates the matching
// Razorpay Plan(s) via Razorpay's REST API and writes the resulting id back
// into razorpay_plan_id_monthly/razorpay_plan_id_yearly. Tiers with no price
// for a cycle (e.g. a "contact sales" tier) are skipped for that cycle.
// Already-synced cycles (razorpay_plan_id_* already set) are skipped too —
// safe to re-run after adding a new tier in the Console.
//
// Usage: node scripts/setup-razorpay-plans.mjs
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RAZORPAY_KEY_ID,
// RAZORPAY_KEY_SECRET in the environment.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error(
    'Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RAZORPAY_KEY_ID, or RAZORPAY_KEY_SECRET in environment.',
  );
  process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: tiers, error: fetchErr } = await admin
  .from('billing_tiers')
  .select('id, name, is_active, monthly_price_paise, yearly_price_paise, razorpay_plan_id_monthly, razorpay_plan_id_yearly')
  .eq('is_active', true);

if (fetchErr) {
  console.error('Failed to load billing_tiers:', fetchErr.message);
  process.exit(1);
}

if (!tiers || tiers.length === 0) {
  console.log('No active billing tiers found — create one in Console (/console/tiers) first.');
  process.exit(0);
}

async function createPlan(tier, cycle, amountPaise) {
  const res = await fetch('https://api.razorpay.com/v1/plans', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      period: cycle === 'yearly' ? 'yearly' : 'monthly',
      interval: 1,
      item: {
        name: `ShelfCure ${tier.name} (${cycle === 'yearly' ? 'Yearly' : 'Monthly'})`,
        amount: amountPaise,
        currency: 'INR',
      },
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.description ?? JSON.stringify(body));
  }
  return body.id;
}

for (const tier of tiers) {
  for (const cycle of ['monthly', 'yearly']) {
    const amountPaise = cycle === 'monthly' ? tier.monthly_price_paise : tier.yearly_price_paise;
    const existingPlanId = cycle === 'monthly' ? tier.razorpay_plan_id_monthly : tier.razorpay_plan_id_yearly;
    const column = cycle === 'monthly' ? 'razorpay_plan_id_monthly' : 'razorpay_plan_id_yearly';

    if (amountPaise == null) {
      console.log(`${tier.name}/${cycle}: no price set, skipping`);
      continue;
    }
    if (existingPlanId) {
      console.log(`${tier.name}/${cycle}: already synced (${existingPlanId}), skipping`);
      continue;
    }

    try {
      const planId = await createPlan(tier, cycle, amountPaise);
      const { error } = await admin.from('billing_tiers').update({ [column]: planId }).eq('id', tier.id);
      if (error) throw new Error(error.message);
      console.log(`${tier.name}/${cycle}: created Razorpay plan ${planId}`);
    } catch (err) {
      console.error(`${tier.name}/${cycle}: failed —`, err.message ?? err);
      process.exit(1);
    }
  }
}

console.log('Done.');
