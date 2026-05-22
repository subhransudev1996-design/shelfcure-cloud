# ADR-0001: Solo developer execution model

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** All phases, timeline, scope choices, team-related risks

## Context

ShelfCure Cloud's PRD (§12) and Implementation Plan (§19) assume a team of 1 fullstack + 1 mobile + 1 PM/QA over ~11 months to reach GA. The actual team is one person (subhransu). This changes everything downstream: parallelization, code review, mobile expertise, support load during beta, and total calendar.

Solo execution is viable for a project of this size only if discipline around scope, sequencing, and quality gates is rigid. Without that, scope creep and quality compromises compound silently.

## Decision

Plan, estimate, and execute as a solo developer. Treat the full PRD scope as the target but acknowledge ~23-month realistic timeline (vs. 11 for the original team plan). Build in **mandatory checkpoints** at end of Phase 2 (desktop done), Phase 3 (web done), Phase 4 (mobile done) where scope is re-evaluated against velocity. Define explicit **cut levers** (MASTER_PLAN §1) that can be pulled at each checkpoint without architectural rework.

## Consequences

**Positive**
- One source of truth in one head — no coordination overhead.
- Decisions are fast.
- Code quality is consistent (no varying styles across contributors).
- Architectural integrity is easier to preserve.

**Negative**
- Bus factor = 1. Illness, burnout, or family event = full project pause.
- No code review for own work → relies entirely on tests + ADRs + linting.
- Mobile and backend skill demands compete for learning time.
- Customer support during beta is also subhransu → caps beta to 5 orgs.
- Calendar doubles vs. team estimate.

**Neutral**
- Forces a tighter feature scope than a team would tolerate.
- Forces aggressive automation (CI, generated types, RLS tests) from day one.

## Alternatives considered

- **Hire a mobile developer before Phase 4** — rejected for now; revisit at Checkpoint B if cash flow allows. Would save ~3 months calendar.
- **Use contractors for specific tracks (e.g. Razorpay integration)** — rejected for v1 to keep architectural coherence; revisit for v1.1 features.
- **Cut to web-only at GA (defer desktop+mobile)** — rejected; the desktop offline POS is the core differentiator vs. competitors. Web-only Cloud has no moat.

## Revisit when

- End of Phase 2 (Checkpoint A) — if >20% behind schedule, pull cut lever 1 (defer mobile to v1.1) and re-baseline.
- Cash flow allows hiring → re-evaluate team size and parallel phases.
- Any health/personal event that disrupts >2 weeks of work → adjust deadlines without compromising quality gates.
