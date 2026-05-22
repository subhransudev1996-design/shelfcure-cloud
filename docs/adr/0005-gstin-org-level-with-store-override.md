# ADR-0005: Org-level GSTIN with per-store override

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Schema (`organizations`, `stores`), GSTR1 export, invoice numbering, Phase 1

## Context

Indian GST law assigns one GSTIN per legal entity per state. Pharmacy realities:
- Solo pharmacy: 1 GSTIN, 1 store. Simple.
- Chain in multiple states: 1 GSTIN per state, multiple stores per state share one GSTIN. Common.
- Chain in one city with multiple addresses under one legal entity: 1 GSTIN, multiple stores. Common.

The PRD originally hinted at "one GSTIN per store" which is technically wrong for the multi-store-same-GSTIN case. GSTR1 filing happens at the GSTIN level, so getting this right affects every report.

## Decision

- `organizations.gstin_default text` — optional org-level GSTIN.
- `stores.gstin text` — optional store-level GSTIN. If null, store inherits `organizations.gstin_default`.
- Effective GSTIN for a store = `coalesce(stores.gstin, organizations.gstin_default)`. Computed via a SQL view `stores_effective` for query clarity.
- GSTR1 export groups sales by **effective GSTIN**, not by store. A multi-store-one-GSTIN chain gets one consolidated GSTR1 per filing period.
- Validation: GSTIN format (15 chars, regex per GSTN spec) enforced in `packages/core/validators.ts`, called by both API and UI.

## Consequences

**Positive**
- Real chain workflows supported from day one.
- Solo pharmacies only fill GSTIN once at org level.
- GSTR1 filing reflects legal reality (one GSTIN = one filing).

**Negative**
- Effective-GSTIN computation needs caching/views to avoid join overhead on hot paths.
- UI must explain inheritance clearly ("This store uses your organization's GSTIN. Override?") to avoid user confusion.

**Neutral**
- HSN summaries, tax breakdowns, and invoice-level reports all key off effective GSTIN, not store.

## Alternatives considered

- **One GSTIN per store, no inheritance** — rejected; doesn't model real chains.
- **GSTIN as a separate first-class entity (1:N stores)** — rejected; over-engineered for v1; can refactor later if needed.
- **Org-level only, no store override** — rejected; multi-state chains need per-state GSTINs and stores are the natural state-binding.

## Revisit when

- A customer needs more than one GSTIN at the org level (multi-state chain). Likely needed by Phase 5 — at that point promote GSTIN to first-class entity.
- GSTR1 export logic becomes a perf bottleneck → consider materialized view.
- GST regulation changes the per-state filing model.
