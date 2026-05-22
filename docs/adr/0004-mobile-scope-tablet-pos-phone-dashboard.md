# ADR-0004: Mobile = tablet full POS + phone dashboard

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Phase 4 (Weeks 47-66), Flutter repo scope, Checkpoint C cut decision

## Context

PRD §3 specifies a Flutter mobile app with three modes: Cashier (billing), Manager (dashboard), Owner (cross-store). The question is how much POS functionality goes on tablet/phone at GA vs. v1.1. Three reasonable scopes:

1. Full POS on tablet + phone dashboard (PRD as-written, ~14 weeks solo Flutter)
2. Tablet POS only (no phone) (~10 weeks)
3. Owner/manager dashboards only, no billing (~6 weeks)

Mobile is the single largest cut lever in the solo plan. The user explicitly chose option 1 despite the timeline implication.

## Decision

Ship the mobile app at GA with:
- **Tablet:** full POS parity with desktop (billing, stock, returns, customers, draft, print via Bluetooth). Layout designed tablet-first.
- **Phone:** dashboards (owner cross-store, manager per-store), inventory view, transfer approvals, day book, low-stock alerts, push notifications, biometric login.
- **Phone billing:** included but with a "compact" layout (single column, no batch picker dropdown — just numeric input). Acknowledged as a v2 polish target.

Mobile is built as a separate repo (`shelfcure-cloud-mobile/`) sharing API contract via codegen artifact. State = Riverpod (ADR-0013).

## Consequences

**Positive**
- Tablet billing replaces a $400 desktop terminal — strong sales story.
- Owners get true anywhere-access from launch.
- Push notifications drive engagement.

**Negative**
- ~20 weeks of solo Flutter work on the critical path.
- Flutter learning curve (if not already proficient) consumes capacity from other phases.
- Cross-language parity tests (TS core ↔ Dart core) add CI complexity.
- Bluetooth printer fragmentation (Star vs Epson vs Chinese OEMs) = ongoing support pain.

**Neutral**
- Phone POS exists but is not first-class; tablet is the recommended billing surface.

## Alternatives considered

- **Owner dashboard + read-only inventory only in v1; billing in v1.1** — rejected by user; saves ~14 weeks but loses tablet-billing customers at launch.
- **Tablet billing only, no phone surface** — rejected; owners need the phone to feel the product daily.
- **React Native instead of Flutter** — rejected; existing scanner team has Flutter expertise; Riverpod + Dart ports of `packages/core` are well-bounded.

## Revisit when

- Checkpoint C (end of Phase 4): if mobile is >30% behind, ship tablet-only and defer phone to v1.1.
- 90 days post-GA: actual % of bills committed from mobile. If <5%, deprioritize mobile feature work for v2.
- Flutter version forces a major migration → re-evaluate maintenance cost.
