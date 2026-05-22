# ADR-0009: Bill print format = org-wide template in v1, per-store override in v1.1

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Schema (`organizations.bill_template`), Settings UI, print module

## Context

PRD §12.2 Q10 asked whether each store can customize its bill format or whether the org uses one template. Chains usually want a consistent customer-facing brand; some stores want their address/phone instead of HQ. There's a real tension.

Building per-store templates upfront adds UI complexity (override editor, preview, validation) for marginal benefit at GA.

## Decision

- v1: single bill template per org, stored as JSON in `organizations.bill_template`. Schema allows a future per-store override (JSON column on `stores.bill_template_override`) without migration.
- Template is JSON-config-driven (ADR-0015), not drag-drop.
- Per-store fields (store name, address, GSTIN, drug license, phone) auto-substitute from the store record. Header/footer/logo are org-wide.
- v1.1 introduces a `stores.bill_template_override jsonb` column and Settings UI to edit per-store.

## Consequences

**Positive**
- Single template editor in v1 (org-wide settings).
- Brand consistency by default — good for chains.
- Per-store info (address, license #) still differs via auto-substitution.

**Negative**
- A store that wants a completely different layout must wait for v1.1.
- Solo pharmacies don't notice the limitation.

**Neutral**
- Template JSON schema documented in `packages/core/billTemplate.ts`.

## Alternatives considered

- **Per-store template from day one** — rejected; doubles Settings UI work for low v1 value.
- **Org-wide only forever** — rejected; loses optionality for chains.
- **Hardcoded template, no customization** — rejected; pharmacies want their logo and footer messages.

## Revisit when

- First chain customer requests per-store override → ship v1.1 column + UI.
- Template JSON becomes painful to edit by hand → prioritize drag-drop editor (ADR-0015 supersede).
