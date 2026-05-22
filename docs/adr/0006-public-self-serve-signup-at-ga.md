# ADR-0006: Public self-serve sign-up at GA

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Phase 3 (onboarding wizard), Phase 8 (hardening), support model, anti-abuse posture

## Context

Two go-to-market models:
1. **Self-serve:** anyone signs up at `cloud.shelfcure.com`, 14-day trial, no card. Scales acquisition but requires polished onboarding, anti-abuse, scalable support.
2. **Sales-led:** signup form → demo → manual activation. Lower volume, higher conversion, less product polish required.

The PRD assumes self-serve. For a solo operator, self-serve is risky because every new user is a potential support ticket and there's no support team. But self-serve is also the only realistic acquisition channel without a sales hire.

## Decision

Ship GA with **self-serve sign-up** for all tiers, with these guardrails:

- **Email verification** mandatory before org creation.
- **Phone OTP** required during signup (also unlocks SMS notifications).
- **CAPTCHA** (Cloudflare Turnstile or hCaptcha) on signup endpoint.
- **Rate limits:** 5 signups per IP per hour, 1 per phone number ever.
- **Trial = 14 days, no card.** No trial extension automation (must email support).
- **Free tier:** none. Trial expires → read-only until paid.
- **In-app help:** searchable docs, video tutorials, contextual hints. Reduces tickets.
- **Office hours:** 2 hours/day scheduled support window during beta. Email-only outside hours.

For **Tier 3 (Chain)** plans, signup is allowed but a follow-up sales call is triggered (book-a-call link shown post-signup).

## Consequences

**Positive**
- Acquisition scales without sales hire.
- Trial-to-paid conversion is measurable from day one.
- Existing Offline customers can self-upgrade without manual onboarding.

**Negative**
- Higher support load — every confused user becomes a ticket.
- Anti-abuse becomes ongoing work (spam signups, fake orgs).
- Onboarding wizard must be production-quality, not "good enough for demo".
- Razorpay tax/KYC compliance on every signup.

**Neutral**
- Marketing site becomes the primary funnel — needs investment.

## Alternatives considered

- **Sales-led only at GA** — rejected; requires hiring sales + slows acquisition.
- **Self-serve for Solo only, sales-led for Team/Chain** — partially adopted (Tier 3 triggers sales follow-up, but signup is still self-serve).
- **Waitlist at GA, then open up** — rejected; loses launch momentum.

## Revisit when

- Support load exceeds 2 hours/day → either hire support or restrict to sales-led.
- Spam signups exceed 10% of total → tighter anti-abuse (paid trial card auth).
- Conversion <5% trial-to-paid → revisit onboarding wizard.
