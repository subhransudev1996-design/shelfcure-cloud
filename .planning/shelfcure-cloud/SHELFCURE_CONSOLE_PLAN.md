# ShelfCure Console — phased build plan

Tracks the build of `apps/console`, the 4th-tier internal admin app for ShelfCure's own
platform staff, per [ADR-0018](../../docs/adr/0018-shelfcure-console-platform-admin-tier.md).

## Phase 1 — Identity, Org Directory, Platform Admins

**Delivered.**

- `platform_admins` identity space (RLS enabled, no policies — every access is RPC-only via
  `is_platform_admin()`), `apps/console` scaffold (port 3003, indigo theme), login/auth gate.
- Org Directory (`/console/orgs`, `/console/orgs/[id]`) — list/search orgs, view stores + staff.
- Platform Admins page (`/console/admins`) — multi-admin support from day one.
- Bootstrap script: `apps/console/scripts/bootstrap-platform-admin.mjs`.

## Phase 2 — Manual org creation

**Delivered.**

- `rpc_console_create_org`, `create-org-with-owner` Edge Function, `CreateOrgButton` —
  platform staff can hand-create an org + owner account for sales-assisted onboarding, with
  immediate access (no email confirmation step).

## Phase 3 — License management UI

**Delivered.**

- Editable `plan_tier` / `billing_status` / `trial_ends_at` via `rpc_console_update_org_license`
  + `EditLicenseButton`, with a full audit trail (`audit_log`, `_platform_admin_id` embedded in
  `after` since platform admins aren't `user_profiles` rows and can't use the existing
  `log_audit()` helper).
- **Not yet enforced** — editable for visibility/ops, no gating logic reads these fields yet.

## Phase 4 — Razorpay billing infrastructure

**Built, pending live credential verification.**

- `billing_plans`, `billing_invoices`, `rpc_console_list_billing_plans`,
  `rpc_console_list_org_invoices`, `rpc_console_save_subscription`.
- Edge Functions: `razorpay-create-subscription`, `razorpay-cancel-subscription`,
  `razorpay-webhook` (HMAC-verified, service-role client, fails closed without
  `RAZORPAY_WEBHOOK_SECRET`), `console-settings-status`.
- `/console/settings` — read-only status page (configured/not-configured booleans only;
  Razorpay credentials are CLI-managed via `supabase secrets set`, never stored in the DB or
  sent to the browser — explicit decision, a DB-backed editable-credentials page was considered
  and rejected).
- Infrastructure only — **no access enforcement**. Placeholder pricing/GSTIN throughout.
- **Blocked**: Razorpay test credentials on file do not match the live dashboard (confirmed via
  screenshot — key id mismatch). Until corrected, `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` /
  `RAZORPAY_WEBHOOK_SECRET` are not set as Supabase secrets; every Razorpay-touching path fails
  closed with a clear error code (`razorpay_not_configured`, `webhook_secret_not_configured`,
  `plan_not_configured`).
- **Known gaps**, deliberate and documented, not silently dropped:
  - GST decomposition is a flat 18% split (`subtotal = round(total / 1.18)`); the precise
    CGST/SGST-vs-IGST line-item breakdown is deferred pending ShelfCure's actual registered state.
  - `setup-razorpay-plans.mjs` has not been run — no real Razorpay Plan ids exist yet.

## Phase 4 extension — Yearly billing + manual/cash license activation

**Delivered.**

Trigger: ShelfCure sells partly through field sales, where many Indian pharmacy customers pay
cash/UPI/cheque in person rather than completing an online checkout. Automated Razorpay billing
alone doesn't cover that. This extension adds a fully independent manual-activation path
alongside the automated one, plus yearly billing as a real (not just monthly) option.

- `billing_plans` gained a `billing_cycle` (`monthly`/`yearly`) dimension with a composite
  `(plan_tier, billing_cycle)` key — independent pricing per cycle per tier, not a discount
  formula off monthly (explicit choice). `enterprise` stays a single cycle-agnostic
  "contact sales" row.
- `billing_invoices.razorpay_payment_id` is now nullable (still `unique` — relies on the
  pre-existing NULL-uniqueness precedent in this codebase) and gained `payment_method`
  (`razorpay`/`cash`/`upi`/`card`/`bank_transfer`/`cheque`), `billing_cycle`, `notes`,
  `recorded_by`, and an idempotency `client_uuid`.
- New RPC `rpc_console_record_manual_payment` — `is_platform_admin()`-gated, activates a license
  immediately (no Razorpay involved): updates `organizations.plan_tier`/`billing_status='active'`,
  decomposes the amount into subtotal/GST, inserts a `billing_invoices` row, writes an
  `audit_log` entry (`_platform_admin_id` + `_manual_invoice_id`). Idempotent via `client_uuid`.
- `rpc_console_create_org` gained `p_trial_days` (additive default `14`) so org creation can pick
  a trial length instead of a hardcoded 14 days.
- `trial_ends_at` is deliberately reused for both meanings — trial deadline when
  `billing_status='trial'`, "license valid until" when manually activated — rather than adding a
  second date column; purely cosmetic UI relabeling based on `billing_status`.
- `create-org-with-owner` now accepts an optional `license` field
  (`{mode:'trial', trial_days}` or `{mode:'paid', billing_cycle, amount_paise, payment_method,
  notes?}`) — chains `rpc_console_create_org` then, for paid mode,
  `rpc_console_record_manual_payment` in the same invocation. If the second call fails, the org
  is **not** rolled back (it genuinely exists; retryable from the org's own page via
  `RecordManualPaymentButton`).
- `razorpay-create-subscription` now takes `billing_cycle` and looks plans up by
  `(plan_tier, billing_cycle)`.
- UI: `CreateOrgButton` gained a License section (trial-vs-paid-now choice, trial presets
  7/14/30/60/90 + custom, paid-mode plan/cycle/amount/method/notes); new
  `RecordManualPaymentButton` for activating/renewing an existing org; `StartSubscriptionButton`
  gained a monthly/yearly toggle; `EditLicenseButton` gained the same trial-day presets plus
  contextual field relabeling; the org detail page's Invoices table gained Method/Cycle columns
  and shows `recorded_by_name`/`notes` for manual rows.
- `setup-razorpay-plans.mjs` rewritten for 6 plans (solo/team/chain × monthly/yearly) — not yet
  run, still blocked on Razorpay credentials.

### Live smoke test (2026-06-19, throwaway orgs, cleaned up after)

- Created an org with `license: {mode:'paid', billing_cycle:'yearly', payment_method:'cash'}`
  (chain, ₹49999/yr) → confirmed `plan_tier='chain'`, `billing_status='active'`,
  `trial_ends_at` exactly 1 year out, a `billing_invoices` row (`payment_method='cash'`,
  subtotal 4237203 + GST 762697 = 4999900 paise), and an `audit_log` row with
  `_manual_invoice_id` + `_platform_admin_id`.
- Created a second org with `license: {mode:'trial', trial_days:30}` → confirmed
  `trial_ends_at` exactly 30 days after `created_at`.
- Called `rpc_console_record_manual_payment` directly on an existing trial org (team/monthly/UPI)
  → activated it; `rpc_console_list_org_invoices` showed the row with method + `recorded_by_name`.
- Called the same RPC again with the identical `client_uuid` → returned the same `invoice_id`,
  no duplicate row — idempotency confirmed.
- Called the RPC as a non-platform-admin (the org's own owner) →
  `permission_denied: platform admin only`.
- Cleaned up: deleted both orgs' `billing_invoices`/`audit_log`/`user_profiles`/`organizations`
  rows and their owner `auth.users` accounts.

## Phase 5 — Fully dynamic billing tiers + limit/feature enforcement

**Delivered.**

Trigger: the hardcoded 4-tier enum (`solo`/`team`/`chain`/`enterprise`) couldn't satisfy the next
requirement — platform admins need to define their own tiers from scratch (name, pricing, trial
length, store/staff limits, feature access) from one Console page, pick a tier when creating an
org instead of typing in pricing each time, and have those limits/features actually enforced.

- New `billing_tiers` table — id, name, slug (auto-derived, editable), description, `is_active`
  (assignable to new orgs), `is_default` (self-serve signup fallback, at most one via a partial
  unique index), `sort_order`, `trial_days`, `monthly_price_paise`/`yearly_price_paise`,
  `razorpay_plan_id_monthly`/`razorpay_plan_id_yearly`, `max_stores`/`max_staff` (null =
  unlimited), `features` jsonb. Replaces `billing_plans` entirely (dropped) — one table for
  "tiers, pricing, trials, and everything," not two kept in sync. Readable by any authenticated
  user (apps/web/apps/admin need their own org's limits/features); writes are RPC-only.
- **Started empty by explicit choice** — the old 4 tiers were *not* migrated in as seed rows.
  `organizations.plan_tier` (the old enum column) is left in place as a legacy/display-only
  fallback for any org never assigned a dynamic tier; the new `organizations.billing_tier_id`
  (nullable FK, `on delete restrict`) is now authoritative. An org with `billing_tier_id = null`
  is treated as **ungoverned** everywhere (unlimited, every feature on) — covers pre-existing
  orgs and fresh deploys before any tier exists, so nothing already working breaks.
- Tier CRUD RPCs: `rpc_console_list_billing_tiers` (with live `org_count` per tier),
  `rpc_console_create_billing_tier`, `rpc_console_update_billing_tier` (jsonb partial update,
  `is_default` is exclusive), `rpc_console_delete_billing_tier` (blocked with `tier_in_use` while
  any org still references it — deactivate or reassign instead).
- `rpc_console_create_org` / `rpc_console_update_org_license` / `rpc_console_record_manual_payment`
  / `razorpay-create-subscription` all switched from a `plan_tier` string param to
  `billing_tier_id` (uuid). `rpc_create_org_with_owner` (self-serve signup) now assigns whichever
  tier has `is_default and is_active` (or stays ungoverned if none configured).
- **Limit enforcement (real, immediate)**: `rpc_create_store` now checks `max_stores` (active
  store count) and `rpc_finalize_staff_profile` checks `max_staff` (active staff excluding the
  owner seat) — both raise `tier_limit_reached` (`23514`) when at the cap, both no-op for
  ungoverned orgs.
- **Feature-toggle enforcement (real, immediate)**: a fixed registry (`FEATURE_FLAGS` in
  `@shelfcure/api-client`) currently has two real, wired-up keys — `advanced_reports` (gates the
  entire `apps/web/app/dashboard/reports` section via a single `layout.tsx`, covering all 16
  report sub-pages) and `staff_payroll` (gates `apps/admin/app/admin/payroll`). `tierHasFeature()`
  is the shared pure helper both gates call; treats a null tier or null features as "feature
  allowed." The *set* of possible feature keys is intentionally bounded by what has a real
  enforcement point in code — adding a new toggle means adding a registry entry **and** a call
  site, not just a Console checkbox with nothing behind it.
- New Console page `/console/tiers` — full CRUD UI (`CreateTierButton`, `EditTierButton`,
  `DeleteTierButton`, shared `TierFormFields`): name, slug, description, monthly/yearly price,
  trial days, max stores/staff, feature checkboxes, active/default toggles. Added to the sidebar
  nav.
- `CreateOrgButton`, `EditLicenseButton`, `RecordManualPaymentButton`, `StartSubscriptionButton`
  all rebuilt to fetch the dynamic tier list and pick a `billing_tier_id` instead of a hardcoded
  plan dropdown; selecting a tier auto-fills price (still editable, per the manual-payment
  discount/partial-payment case) and, for trials, the tier's own default `trial_days`.
- `setup-razorpay-plans.mjs` rewritten to sync Razorpay Plans from whatever tiers currently exist
  (re-runnable — skips tiers/cycles already synced or with no price set) instead of a fixed
  6-plan list.
- **Two real bugs found and fixed during live verification** (not previously exercised live in
  this environment):
  - `rpc_finalize_staff_profile`'s `RETURNS TABLE(id uuid, ...)` output parameter named `id`
    conflicted with unqualified `id` references inside the function body (PL/pgSQL
    `plpgsql.variable_conflict='error'`), raising `42702: column reference "id" is ambiguous`
    the first time staff creation actually ran. Fixed by table-qualifying every `id` reference.
  - `rpc_console_list_org_invoices` was never updated to return the `billing_tier_id`/
    `tier_name_snapshot` columns added to `billing_invoices` — the Invoices table's new Tier
    column would have silently shown nothing. Fixed via drop+create with the columns added.

### Live smoke test (2026-06-19/20, throwaway tier + orgs, cleaned up after)

- Created tier "SMOKETEST Starter" (₹999/mo, ₹9999/yr, 14-day trial, `max_stores=1`,
  `max_staff=1`, `features={advanced_reports:false, staff_payroll:true}`) →
  `rpc_console_list_billing_tiers` showed it with `org_count=0`.
- Created an org on that tier with `license:{mode:'paid', billing_cycle:'monthly',
  payment_method:'cash'}` → `billing_tier_id` set, `billing_status='active'`, `trial_ends_at`
  exactly 1 month out, nested `billing_tier` object with the correct limits/features.
- Logged in as that org's owner: created 1 store (succeeded), attempted a 2nd →
  `tier_limit_reached: ... up to 1 store(s)`. Created 1 staff member (succeeded, after fixing the
  ambiguous-`id` bug above), attempted a 2nd → `tier_limit_reached: ... up to 1 staff member(s)`.
- Created a second org with `license:{mode:'trial', billing_tier_id, trial_days:30}` → confirmed
  `trial_ends_at` exactly 30 days after `created_at`.
- Confirmed `rpc_console_record_manual_payment` with `p_billing_tier_id` is idempotent (same
  `client_uuid` twice → same `invoice_id`, no duplicate), and that the invoice now correctly
  carries `billing_tier_id`/`tier_name_snapshot`.
- Confirmed a non-platform-admin (the org owner) gets `permission_denied` from both
  `rpc_console_create_billing_tier` and `rpc_console_delete_billing_tier`.
- Confirmed `rpc_console_delete_billing_tier` is blocked (`tier_in_use: 2 organization(s)`) while
  both test orgs still reference it, then deleted cleanly once they were removed.
- Cleaned up: deleted both orgs (`billing_invoices`/`audit_log`/`stores`/`user_profiles`/
  `organizations`, owner+staff `auth.users` rows) and the test tier.

## Phase 6 — Org-level suspend + hard delete

Requested: `/console/orgs` needed a way to suspend an org's subscription (real
enforcement, not just a status label) and to delete an organization entirely.
Clarified up front: **delete = true hard delete, irreversible** (explicitly
chosen over a soft-delete/deactivate alternative); **suspend = real
enforcement**; **enforcement point = at sign-in** (the sign-in attempt itself
fails for a suspended org), not a per-page check after login.

- **Schema**: `organizations.is_suspended boolean default false` +
  `suspended_at timestamptz`, deliberately orthogonal to `billing_status` — a
  kill switch that toggles independently, so unsuspending restores whatever
  billing state the org already had instead of guessing what to revert to.
- **`rpc_console_set_org_suspended(p_org_id, p_suspended)`** — platform-admin
  gated, audited via the same direct-`audit_log`-insert pattern as the
  license RPCs (`user_id = null`, admin id embedded in `after`).
- **`rpc_check_org_access()`** — not platform-admin gated; any authenticated
  user calls this about themselves right after
  `supabase.auth.signInWithPassword` succeeds. Returns
  `{allowed:false, reason:'suspended'}` for a suspended org's member, in
  which case `apps/web` and `apps/admin`'s login pages immediately call
  `supabase.auth.signOut()` and show an error instead of navigating —
  this is the actual sign-in enforcement point. An already-open session is
  *not* torn down; suspension only blocks future sign-ins, per the explicit
  scope decision.
- **`rpc_console_delete_organization(p_org_id, p_confirm_name)`** — the hard
  delete. Requires the caller to pass the org's exact current name (checked
  server-side, independent of the UI's disabled-button guard). Walks ~30
  tables in dependency-safe order and deletes every row scoped to the org,
  then the org itself:
  - Sales side (returns before sales; items cascade from their header).
  - Purchases side (returns before purchases; challans/orders are
    independent — only `set null` back to purchases).
  - Stock transfers.
  - `stock_corrections` / `doctor_commission_payouts` / `staff_salary_payments`
    / `expenses`, in that order (each restricts back to the next).
  - `batches` → `medicines`/`medicine_categories` → `doctors`/`customers`/
    `suppliers`.
  - `notifications` / `billing_invoices` / `audit_log` / org-scoped
    `expense_categories` rows (system-wide rows with `org_id null` untouched).
  - `user_profiles` last among data tables — every `created_by`/`updated_by`/
    `performed_by`/`paid_by` reference back to it is gone by this point.
  - `stores`, then `organizations` itself — `pos_hotkey_groups` (the one
    table in this schema with `on delete cascade` straight from
    `organizations`, instead of the universal `restrict`) cleans itself up
    automatically here.
  - Returns the deleted org's former staff `auth.users` ids — Postgres can't
    delete those itself (needs the service role).
  - **No audit_log entry survives this action** — the org's own audit trail
    is deleted as part of the wipe, and a fresh row can't reference an org
    that no longer exists. Intentional: hard delete means irreversible *and*
    untraceable, matching the explicit product decision.
- **`console-delete-org` Edge Function** — calls the RPC as the caller (so
  `is_platform_admin()` and the name-confirmation check run in Postgres),
  then loops `admin.deleteUser()` over the returned ids with the service-role
  client. Reports `failed_user_ids` if any auth cleanup call fails — the
  database deletion has already happened by that point regardless, so
  there's nothing to roll back to.
- **Console UI**: `/console/orgs/[id]` gained a "Suspend subscription"/
  "Unsuspend" button (confirm modal) and a "Delete organization" button
  (type-the-exact-org-name-to-confirm modal, confirm button stays disabled
  until the typed text matches). A red "Suspended since ..." banner shows on
  the org page; the org list page shows a red "Suspended" badge next to the
  name.
- `rpc_console_list_orgs` updated (drop+create) to surface `is_suspended`/
  `suspended_at`; `rpc_console_get_org_detail` needed no change since it
  already returns `to_jsonb(v_org.*)`, which picks up new columns for free.

### Live smoke test (2026-06-20, throwaway org, cleaned up by the test itself)

- Created a throwaway trial org via Console, with a known owner
  email/password.
- Suspended it → banner + list badge appeared. Signed in as the owner on
  `apps/web` → rejected with *"Your organization's subscription has been
  suspended..."*, stayed on `/login`.
- Unsuspended it → signed in again as the same owner → succeeded, landed on
  `/dashboard`.
- On the delete modal: confirm button stayed disabled with no input;
  typing the wrong org name kept it disabled client-side. Called the
  `console-delete-org` Edge Function directly with a wrong `confirm_name` —
  rejected server-side with `name_mismatch` (`22023`); org page still loaded
  fine afterward (proving nothing had been touched).
- Called it again with the correct name → `{deleted_user_count: 1,
  failed_user_ids: []}`. Reloading the org's old detail URL now 404s;
  the org no longer appears in `/console/orgs`; signing in again with the
  same owner email/password now fails with "Invalid login credentials" —
  confirming the `auth.users` row was actually deleted, not just the
  database rows.

## Standing follow-up (not yet pursued — only on explicit request)

Once correct Razorpay credentials are provided:
`supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=...` → run
`setup-razorpay-plans.mjs` (creates 6 plans) → live-test `razorpay-create-subscription` →
register the webhook URL
(`https://fmcfpokhlvyurtulnnqh.supabase.co/functions/v1/razorpay-webhook`) in the Razorpay
dashboard → get the webhook secret → `supabase secrets set RAZORPAY_WEBHOOK_SECRET=...` →
send a test webhook event to confirm payload parsing.
