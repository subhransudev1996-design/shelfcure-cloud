# ADR-0007: Accountant role = org-wide read-only on ops + financials

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** RLS policies, Phase 1 schema, Reports module

## Context

PRD §5 defines the accountant as "org-wide, read-only" but left open whether they can see financials (P&L, expenses) or only operational data (sales, purchases). Accountants and CAs need both — they file GST returns, prepare books, and need expense and payment data.

But "read-only on everything" can leak sensitive data (e.g. employee salaries if those land in expenses, or vendor pricing in chains). The decision is whether to scope down by default or trust the role.

## Decision

The `accountant` role has **read-only access across the entire org**:
- Sales, sale items, payments, returns — all stores.
- Purchases, purchase items, returns — all stores.
- Expenses — all stores. (No employee-PII fields stored in expenses; if added later, a separate `expense_sensitive` flag will gate visibility.)
- Stock levels, batches — all stores (read-only).
- Customers, suppliers, doctors — all stores.
- All reports including P&L, GSTR1, day book, top movers.
- Audit log — read-only.

Accountants **cannot**:
- Edit, insert, or delete any row.
- See user management (other than viewing their own profile).
- See billing / subscription details (org_admin only).
- See settings (org or store).

RLS enforces this: accountant gets `select` policies on all business tables scoped to `org_id = current_org()`, no `insert/update/delete` policies.

## Consequences

**Positive**
- Accountants/CAs have everything they need without bothering the owner.
- One role covers GST filing, books prep, audit support.
- Clean RLS model: presence of role + select policy = access, no edge cases.

**Negative**
- An accountant could screenshot competitive pricing if they have multiple clients. Mitigated by audit log on accountant reads (logged via Sentry breadcrumb).
- Owners must trust their accountant. Standard for the role; not unique to Cloud.

**Neutral**
- Reports module must check accountant role and hide write-actions (download button only).

## Alternatives considered

- **Operational data only (no expenses/P&L)** — rejected; accountants need expenses to file books.
- **Per-store accountant** — rejected; CAs are typically engaged at the org level.
- **Custom permission matrix per accountant** — rejected; over-engineered for v1; revisit if customers ask.

## Revisit when

- A customer requests a "limited accountant" who can see only specific stores → introduce optional store-scope on accountant role.
- Compliance audit flags PII exposure → add fine-grained PII masking.
- Audit log of accountant reads becomes too noisy → reduce granularity.
