# ADR-0012: Store code = 6 chars, unique within org

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Schema (`stores.code`), bill/purchase/transfer numbering, UI

## Context

Each store needs a short code for use in bill numbers, purchase numbers, transfer numbers (PRD §7.7: `S/{store_code}/{fy}/{seq}` etc.). The code goes on every printed bill and screen. PRD §12.2 Q5 asked if 6 chars is enough for a 50-store chain across 20 cities.

6 chars allows reasonable patterns: `MUM01`, `BLR-A1`, `DEL-05`, `HYDB02`. Tight but workable.

## Decision

- `stores.code text not null` with constraints: `length(code) between 2 and 6`, `code ~ '^[A-Z0-9-]+$'` (uppercase alphanumeric + hyphen).
- `unique (org_id, code)`.
- Suggested at store creation from the city/area name but editable.
- Cannot be changed after first bill is generated under that code (would corrupt historical numbering). UI enforces this.
- A "legacy" `prior_codes text[]` column allows tracking renames if absolutely necessary (rare).

## Consequences

**Positive**
- Compact prints: bill number `S/MUM01/2526/00042` is 20 chars and readable.
- Forces stores to pick meaningful codes (no UUIDs in customer-facing strings).
- Uniqueness enforced at DB level.

**Negative**
- 6 chars insufficient for orgs with >36² (~1300) stores using simple patterns — but v1 caps at 50 stores so non-issue.
- Renaming a store's code post-billing is blocked → may frustrate orgs that didn't think it through during setup.

**Neutral**
- Bill, purchase, and transfer prefixes all use the same `code`.

## Alternatives considered

- **8 chars** — rejected; longer prints, more space, but no real win at <50 stores.
- **Auto-generated UUIDs** — rejected; horrible user experience on bills.
- **Sequential integer (Store #1, #2)** — rejected; loses city/area meaning.

## Revisit when

- A chain wants >50 stores → revisit length and uniqueness scope.
- A user requests post-billing code rename → consider a two-step migration with old/new code mapping for historical lookup.
