# ADR-0013: Mobile state management = Riverpod

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Phase 4 (`shelfcure-cloud-mobile`), all Flutter feature code

## Context

Flutter state management options: Provider, Riverpod, Bloc, GetX, MobX. IMPL §22 Q2 listed Riverpod as the recommended choice. Bloc is the other widely-used industrial option. The difference matters because every feature touches state and refactoring later is expensive.

## Decision

Use **Riverpod 2.x** (with code generation via `riverpod_generator`).

Conventions:
- `NotifierProvider` for mutable state (one per feature).
- `FutureProvider` / `StreamProvider` for async data (Supabase queries, Realtime).
- Provider scoping: app-level for auth, user, current store. Feature-level for screen-specific state.
- All providers code-generated (no manual provider declarations).
- Riverpod's `ProviderContainer` used in tests for dependency injection.

## Consequences

**Positive**
- Less boilerplate than Bloc.
- Code generation enforces consistent provider patterns.
- Strong testability via container overrides.
- Active community, well-documented, stable maturity.

**Negative**
- Steeper learning curve than Provider for newcomers.
- Code generation adds a `build_runner` step to local + CI workflow.
- Documentation churn: Riverpod 1 vs 2 is a confusing search trap. Pin docs to 2.x.

**Neutral**
- Same pattern used by Dart port of `packages/core` (pure functions, no state, providers wrap them).

## Alternatives considered

- **Bloc** — rejected; more boilerplate, less ergonomic for the dashboard-heavy mobile UX.
- **Provider** (original) — rejected; less safe (no compile-time provider guarantees).
- **GetX** — rejected; opinionated patterns conflict with our architecture (one-app-per-role).

## Revisit when

- Riverpod 3 lands and changes patterns materially → evaluate migration cost.
- A specific feature struggles with Riverpod (rare) → use targeted alternative within that feature only.
