# ADR-0003: CSV-only Offline→Cloud migration at GA; automated migrator in v1.1

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Phase 3 onboarding wizard, customer success during beta + GA, v1.1 backlog

## Context

ShelfCure Offline customers are the warmest leads for Cloud. The question is whether to invest in an automated migrator that reads Offline's local SQLite and uploads everything to Cloud (preserving sales/purchase history, batches, customers, etc.) or to provide only a CSV export/import path at GA.

Automated migration would cost ~4-6 weeks: SQLite reader, schema mapping (Offline pharmacy_id → Cloud org+store), conflict handling, batch upload, partial-failure recovery, UI. It's well-bounded but not trivial, and would have to be revalidated for every Offline release that lands during the build.

CSV-only is much cheaper but loses sales/purchase lineage — customers re-enter as a fresh ledger and old data lives only in their Offline install.

## Decision

Ship Cloud GA with a **polished CSV import wizard** in the onboarding flow. Templates provided for: medicines (with HSN/GST/batches), customers, suppliers, doctors, opening stock. No automated SQLite migration in v1.

Build the automated Offline-to-Cloud migrator as a **v1.1** post-launch feature, informed by which Offline customers actually upgrade and what they ask for. Treat it as a paid optional service if needed.

## Consequences

**Positive**
- ~4-6 weeks saved in critical-path.
- CSV importer is reusable for any source system, not just Offline.
- Avoids tight coupling to Offline's schema during the build window.

**Negative**
- Existing Offline customers face friction upgrading; some won't bother.
- "Where did my old sales go?" is a real support question — answer is "they're still in Offline; Cloud starts a fresh ledger".
- Risk of losing customers to a competitor that does offer migration.

**Neutral**
- Offline product keeps running and shipping bug fixes — migration urgency stays low.

## Alternatives considered

- **Automated migrator at GA** — rejected on cost (4-6 weeks); revisit for v1.1.
- **Hybrid: CSV at GA, automated for Tier 3 only at GA** — rejected; per-customer manual migration doesn't scale and creates support load.
- **Defer Cloud GA until automated migrator is ready** — rejected; GA timing is already long enough.

## Revisit when

- 30 days post-GA: how many Offline customers signed up for Cloud? If <10%, automated migration may be the unlock.
- First Tier 3 lead refuses to sign up due to migration friction → consider doing a manual migration as a paid service and use the learnings to spec the automated tool.
- Offline's schema stabilizes (no migrations for 6+ months) → easier to build automated migrator.
