# ADR-0002: Org-shared masters behind a feature flag in v1

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Schema (medicines, customers, suppliers, doctors), RLS policies, Phase 1, Phase 3 onboarding, chain pilots

## Context

PRD §6.1 originally scoped medicines/customers/suppliers as **per-store** in v1, with org-wide sharing deferred to v1.1. Chain customers (Tier 3) are likely to demand a single centrally-managed medicine master from day one — otherwise every store re-enters the same 50k SKUs and price changes don't propagate.

Locking in per-store now means a painful schema migration + dedup pass later. Building full org-shared masters now adds ~3 weeks to Phase 1.

A feature flag costs almost nothing if planned from day one and bought meaningful optionality.

## Decision

Schema supports both modes from day one. Every master table (`medicines`, `customers`, `suppliers`, `doctors`, `medicine_categories`) gets a nullable `store_id` and a non-null `org_id`. An `organizations.shared_masters_enabled boolean default false` flag controls UI behavior and RLS visibility:

- Flag off (default): UI scopes everything to `store_id = current user's store`; RLS allows reads/writes only for matching store.
- Flag on: UI shows org-wide list; RLS allows reads across org and writes scoped to permitted roles.

Per-store overrides for selling price and reorder level are stored on a separate `store_medicine_overrides` table (built only when first chain needs it).

## Consequences

**Positive**
- No schema migration when chains demand sharing.
- Chain pilots can run with shared masters during beta without rework.
- Solo stores see no extra complexity (flag off, UI identical to per-store world).

**Negative**
- RLS policies are slightly more complex (must read the flag).
- Slightly more risk of accidental cross-store data leak — mitigated by RLS test matrix covering both flag states.
- More test combinations.

**Neutral**
- Master tables carry `org_id` + nullable `store_id` everywhere — needs consistent indexing.

## Alternatives considered

- **v1 = per-store only** (PRD as-written) — rejected; locks out chains, requires schema migration in 6-12 months.
- **v1 = shared from day one, no flag** — rejected; small-org UI gets more cluttered without need; harder to reason about per-store data ownership for solo customers.
- **Separate tables (org_medicines / store_medicines)** — rejected; double the code surface, complex joins for cross-store reports.

## Revisit when

- First chain pilot wants per-store price overrides → build `store_medicine_overrides` table.
- Post-GA usage shows <5% of orgs ever enable the flag → consider removing complexity in v2.
- RLS test matrix becomes hard to maintain (>500 tests) → revisit overall isolation strategy.
