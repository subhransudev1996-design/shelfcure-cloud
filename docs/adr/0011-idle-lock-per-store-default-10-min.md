# ADR-0011: Terminal idle-lock configurable per store, default 10 minutes

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Schema (`stores.idle_lock_minutes`), desktop app, mobile app

## Context

Shared pharmacy terminals stay logged in all day. If a cashier walks away, anyone can complete a sale, modify stock, or look at customer phone numbers under that cashier's identity. PRD §12.2 Q7 asked whether idle-lock should be on by default and configurable.

Hard idle locks frustrate cashiers if too aggressive (re-PIN every 2 minutes during a slow hour). Too lax (1 hour) defeats the purpose.

## Decision

- New column: `stores.idle_lock_minutes integer not null default 10`.
- Range: 1-120 minutes. 0 disables (not recommended; warning shown).
- Idle = no keyboard, mouse, or barcode scan input on the terminal.
- Lock screen prompts for PIN (not full email/password). PIN matches the user already logged in.
- Configurable in **Store Settings** by `store_admin` or `super_admin`.
- Same setting applies to mobile (Bluetooth keyboard taps + screen touches count as activity).
- POS mid-sale grace: if a sale is in progress (cart non-empty), idle timer pauses. Resumes on commit/discard.

## Consequences

**Positive**
- Sensible default protects customers and stock without over-friction.
- Stores can tune to their workflow.
- Mid-sale grace prevents losing carts to lock-outs.

**Negative**
- More code paths to test (idle detection, mid-sale state, PIN unlock).
- A determined user could circumvent by tapping the screen periodically — but at that point the policy is moot.

**Neutral**
- Activity detection lives in the Tauri shell (desktop) and Flutter (mobile).

## Alternatives considered

- **Org-wide setting only** — rejected; a busy front store and a quiet back store have different needs.
- **No idle lock** — rejected; security and audit problem.
- **Hardcoded 15 minutes** — rejected; some pharmacies want stricter (5 min), some want more relaxed (30 min).

## Revisit when

- Customers complain about lock-outs mid-shift → adjust grace logic.
- Pentest flags PIN bypass — strengthen unlock.
- Mobile background-task suspension breaks idle detection on iOS/Android — revisit detection strategy.
