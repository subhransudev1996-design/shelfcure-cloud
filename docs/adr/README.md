# Architecture Decision Records (ADRs)

These ADRs lock in the foundational decisions for ShelfCure Cloud v1. Each captures the *why* behind a choice so future-you (or a future teammate) doesn't have to re-derive it.

## Conventions

- **Status:** `Proposed` → `Accepted` → (optionally) `Superseded by ADR-NNNN`
- **Numbering:** zero-padded 4 digits, never reused.
- **Format:** Context → Decision → Consequences → Alternatives considered → Revisit when.
- **Scope:** these record decisions, not implementation detail. Code lives in the monorepo; algorithms live in `packages/core`; ADRs live here.
- **Revisit:** every ADR has a trigger condition. If the trigger fires, write a successor ADR (don't edit the original).

## Index

| # | Title | Status | Affects |
|---|---|---|---|
| [0001](0001-solo-developer-execution.md) | Solo developer execution model | Accepted | All phases |
| [0002](0002-org-shared-masters-feature-flag.md) | Org-shared masters behind a feature flag in v1 | Accepted | Schema, Phase 1 |
| [0003](0003-offline-to-cloud-migration-csv-first.md) | CSV-only Offline→Cloud migration at GA; automated migrator in v1.1 | Accepted | Phase 3 onboarding, post-v1 |
| [0004](0004-mobile-scope-tablet-pos-phone-dashboard.md) | Mobile = tablet full POS + phone dashboard | Accepted | Phase 4 |
| [0005](0005-gstin-org-level-with-store-override.md) | Org-level GSTIN with per-store override | Accepted | Schema, GSTR1 export |
| [0006](0006-public-self-serve-signup-at-ga.md) | Public self-serve sign-up at GA | Accepted | Phase 3, Phase 8 |
| [0007](0007-accountant-org-wide-readonly-full-financials.md) | Accountant role: org-wide read-only on ops + financials | Accepted | RLS, Phase 1 |
| [0008](0008-multi-org-login-out-of-scope-v1.md) | Multi-org login out of scope for v1 | Accepted | Schema, Auth |
| [0009](0009-bill-format-org-wide-v1.md) | Bill print format: org-wide template in v1, per-store override in v1.1 | Accepted | Settings, print |
| [0010](0010-ai-credits-org-level-pool.md) | AI credits = org-level pool | Accepted | Schema, AI scan |
| [0011](0011-idle-lock-per-store-default-10-min.md) | Terminal idle-lock configurable per store, default 10 min | Accepted | Schema, desktop |
| [0012](0012-store-code-6-chars-unique-within-org.md) | Store code = 6 chars, unique within org | Accepted | Schema, numbering |
| [0013](0013-mobile-state-riverpod.md) | Mobile state management = Riverpod | Accepted | Phase 4 |
| [0014](0014-edge-functions-supabase-deno.md) | Edge function runtime = Supabase Edge (Deno) | Accepted | All server-side functions |
| [0015](0015-bill-print-template-json-v1.md) | Bill print template = JSON config in v1, drag-drop in v2 | Accepted | Settings |
| [0016](0016-audit-log-monthly-partitioned.md) | Audit log partitioned monthly from day one | Accepted | Schema |
| [0017](0017-gst-on-subscription-exclusive.md) | 18% GST added on top of subscription pricing | Accepted | Razorpay plans, invoicing |
| [0018](0018-shelfcure-console-platform-admin-tier.md) | ShelfCure Console — platform-level admin tier above the org owner | Accepted | Schema, Auth, `apps/admin` naming, Razorpay billing, new `apps/console` |

## Process

To add a new ADR:
1. Pick the next number (look at the highest in the table above + 1).
2. Copy `0000-template.md`.
3. Fill it in. Keep it tight — ~50 lines is the target.
4. Add the row to the table.
5. Open a PR. Discuss in review. Merge as `Accepted` (or `Proposed` if you want to gather more input).

To supersede an ADR:
1. Write a new ADR with the new decision.
2. Edit the old ADR's status to `Superseded by ADR-NNNN` (with link).
3. Never delete an old ADR. The history is the point.
