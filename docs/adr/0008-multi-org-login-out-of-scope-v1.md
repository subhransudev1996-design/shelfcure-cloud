# ADR-0008: Multi-org login out of scope for v1

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Schema (`user_profiles.org_id`), Auth, future v1.1 backlog

## Context

A user belonging to multiple orgs is a real use case: a CA serves 5 pharmacy chains; a regional manager works for two partner brands. PRD §1.3 marked this as a non-goal for v1.

The schema choice is consequential: if `user_profiles` has a non-null `org_id` (1:1), supporting multi-org later requires a migration to a join table (`user_org_memberships`). If we model multi-org from day one with the join table, every query gets an extra hop and the UI needs an "active org" switcher always.

## Decision

v1 stays single-org per user. `user_profiles.org_id` is `not null`. One Supabase `auth.users` row maps to exactly one `user_profiles` row in one org.

If a CA needs to serve two pharmacies, they create two separate accounts (different email aliases). Documented in onboarding FAQ.

v1.1 will introduce `user_org_memberships(user_id, org_id, role, store_id, is_active, joined_at)` and migrate `user_profiles` to be org-agnostic (profile holds name, phone, PIN; membership holds role/scope per org). Migration plan written in advance, executed when first paying customer requests multi-org.

## Consequences

**Positive**
- Simpler schema, RLS, and queries throughout v1.
- Onboarding wizard is linear (no org-picker).
- Auth-to-tenant resolution is one lookup.

**Negative**
- Multi-org users must juggle multiple accounts (different passwords, no SSO between).
- Schema migration to multi-org is non-trivial in v1.1 (touches every RLS policy).
- A CA can't see all clients in one view at GA.

**Neutral**
- Future migration cost is bounded and predictable.

## Alternatives considered

- **Model multi-org from day one** — rejected; doubles auth complexity for ~5% of v1 use cases.
- **Single-user-multi-email hack** — partially adopted as the documented workaround.

## Revisit when

- 3+ paying CAs/accountants explicitly request multi-org → schedule v1.1 migration.
- SSO becomes a Tier 3 feature → multi-org is a natural pairing.
- Org churn analysis shows multi-org users dropping the second account → confirms demand.
