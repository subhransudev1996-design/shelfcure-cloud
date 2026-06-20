# ADR-0018: ShelfCure Console — a platform-level admin tier above the org owner

- **Status:** Accepted
- **Date:** 2026-06-19
- **Decider:** subhransu
- **Affects:** Schema (new `platform_admins` identity space), Auth, `apps/admin` naming, Razorpay billing (ADR-0017), new `apps/console`

## Context

Today there are three role tiers, all scoped to exactly one organization via `user_profiles.org_id NOT NULL` (ADR-0008): `super_admin` (the org owner), store-scoped roles, and `accountant`. Org creation is fully self-serve (ADR-0006) via `rpc_create_org_with_owner` — anyone signs up, gets a 14-day trial, and becomes `super_admin` of their own new org. `organizations.plan_tier` / `billing_status` / `trial_ends_at` / `razorpay_customer_id` / `razorpay_subscription_id` exist in the schema but are decorative — nothing enforces them, and the Razorpay billing integration ADR-0017 describes was never built.

As ShelfCure grows, self-serve doesn't cover two needs: (1) ShelfCure's own staff need visibility across every customer organization, including the ability to manually create an org + its owner account for sales-led/enterprise deals (ADR-0006 already anticipated a "book-a-call" path for Tier 3/Chain); (2) the unused billing/license columns need to become real, with actual Razorpay subscription billing wired up per ADR-0017's GST-exclusive design.

`apps/admin` already brands itself "ShelfCure Admin" for the org owner. Reusing that name, or that app, for a true ShelfCure-internal tool would conflate two very different audiences — a customer who owns one pharmacy chain vs. ShelfCure's own staff who can see every customer.

## Decision

Build a third, independent application — **ShelfCure Console** (`apps/console`) — for ShelfCure's own staff, not customers:

- Own login, own identity space: a new `platform_admins` table, **not** `user_profiles` — platform staff don't belong to any org, so they can't fit the existing `org_id NOT NULL` shape (ADR-0008). Supports multiple platform admins from day one, not a single hardcoded founder account.
- Lists/searches every organization across the platform, and can manually create a new organization + its owner account on a customer's behalf (the effect `rpc_create_org_with_owner` has today, but invoked by platform staff for sales-assisted onboarding instead of self-serve signup).
- Manages that org's `plan_tier` / `billing_status` / `trial_ends_at`, and wires up real Razorpay subscription billing (subscription creation/cancellation, webhook-driven `billing_status` sync, GST-exclusive invoicing per ADR-0017) using the already-reserved `razorpay_customer_id` / `razorpay_subscription_id` columns.
- Self-serve signup (ADR-0006) is unchanged and stays the primary acquisition path for Solo/Team tiers; the Console is additive — for ops/support and sales-assisted Chain/Enterprise onboarding, not a replacement.
- `apps/admin`'s "ShelfCure Admin" branding/badge should be revisited (e.g. renamed to "Owner") in a follow-up cleanup to remove the naming clash with "ShelfCure Console" — tracked, not blocking this ADR.

## Consequences

**Positive**
- ShelfCure gets a real back-office: support can extend a trial, sales can hand-create enterprise orgs, and billing becomes enforceable instead of cosmetic.
- Fully additive — doesn't touch the existing three-tier customer-facing role model or ADR-0008's single-org-per-user schema.
- Multi-admin from day one means onboarding a second ShelfCure teammate later needs no schema rework.

**Negative**
- Full Razorpay integration (webhooks, subscription lifecycle, GST invoicing) is a substantial build, not a quick add — needs its own phased plan (see `SHELFCURE_CONSOLE_PLAN.md`).
- A fourth identity space (`platform_admins`) is new attack surface that can see across every customer org — the single highest-blast-radius credential in the system; needs the most careful security review of anything built so far.
- Turning the currently-decorative billing fields into enforced ones may surface customers whose trial already lapsed or whose plan was never actually paid — needs a one-time reconciliation pass before enforcement goes live.

**Neutral**
- "ShelfCure Console" needs to be reflected consistently going forward: `apps/console`, `@shelfcure/console`.

## Alternatives considered

- **Add a platform tier inside `apps/admin`** — rejected; conflates ShelfCure staff with org owners in one app/login, and platform staff can't be a `user_profiles` row under ADR-0008's `org_id NOT NULL` constraint without contorting the schema.
- **Manual license overrides only, defer real Razorpay billing** — considered as a smaller v1; rejected in favor of building the full billing integration now.
- **Single hardcoded platform-admin account** — rejected in favor of supporting multiple admins from day one.

## Revisit when

- A second ShelfCure employee actually needs Console access (validates the multi-admin investment).
- Razorpay webhook volume/complexity reveals the integration needs to be its own service rather than living inside the Console app.
- Self-serve signup (ADR-0006) and Console-created orgs need to interoperate in ways not covered here (e.g. converting a self-serve trial into a sales-led contract).
