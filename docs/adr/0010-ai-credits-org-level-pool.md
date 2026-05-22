# ADR-0010: AI credits = org-level pool

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Schema (`ai_credits`, `ai_credit_transactions`), AI bill scan edge function, Settings UI

## Context

The AI bill scan feature (Gemini OCR on purchase bills) consumes a paid resource per call. PRD §12.2 Q11 asked whether credits should be pooled at the org level or budgeted per store. Per-store budgets give predictability; org pool gives flexibility (a busy store can use idle stores' credits).

## Decision

- One credit pool per org, stored in `ai_credits(org_id, balance, updated_at)`.
- All scan events deduct from the pool regardless of which store initiated.
- Audit per transaction in `ai_credit_transactions(org_id, user_id, store_id, amount, kind, reference, created_at)` — `kind in ('topup','scan','refund','grant')`.
- Credits purchasable in packs via Razorpay (separate from subscription). Some packs bundled with plan tiers as monthly grants.
- Org admins can see per-store usage breakdown in Settings → AI Credits.
- Per-store soft caps (configurable) can be set in v1.1 if abuse becomes an issue.

## Consequences

**Positive**
- Flexible for chains — credits flow to where they're needed.
- One billing flow (top-up the org), simpler invoicing.
- Per-store visibility via reports without enforcing per-store hard limits.

**Negative**
- A single store can drain the org's credits in one sitting. Mitigated by per-user daily cap (50 scans/day default).
- Cross-store fairness depends on org admin watching usage.

**Neutral**
- All scan edge function logic checks org credit, not store credit.

## Alternatives considered

- **Per-store pool** — rejected; rigid for chains, more billing complexity.
- **Per-user pool** — rejected; doesn't match purchase-team workflows where one user scans for multiple users' inventory.
- **No quotas, billed per scan** — rejected; surprise bills harm trust.

## Revisit when

- A chain complains about one store draining credits → ship v1.1 per-store soft caps.
- Credit packs underused → bundle more aggressively into plan tiers.
- Gemini pricing changes materially → adjust credit-to-call ratio.
