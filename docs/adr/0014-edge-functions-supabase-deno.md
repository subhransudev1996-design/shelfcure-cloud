# ADR-0014: Edge function runtime = Supabase Edge (Deno)

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** All server-side functions (Razorpay webhook, AI scan, WhatsApp, e-invoice, data export, etc.)

## Context

Server-side code that's too sensitive for the client (API keys, webhooks, cron jobs) needs to run somewhere. Options:

1. **Supabase Edge Functions** (Deno) — colocated with the database, fastest DB access, integrated with Supabase Auth context.
2. **Vercel Functions** (Node) — colocated with web app, easier to share TS code with the rest of the monorepo.
3. **Standalone server** (Fly.io, Railway) — most flexible but most ops.

IMPL §22 Q6 recommended Supabase Edge.

## Decision

Use **Supabase Edge Functions (Deno)** for all server-side logic with these exceptions:

- Webhooks called by external services with strict timing (Razorpay): Supabase Edge primary, with a 5s failover queue at Vercel as backup (out of v1 scope; revisit if outages observed).
- Long-running jobs (data export, monthly aggregations): Supabase Edge invokes the job, work happens via Postgres functions + cron.

Code sharing:
- Edge functions can `import` from a `shared/` directory checked in alongside `supabase/functions/`.
- `packages/core` math is duplicated as a Deno-compatible bundle for use in functions (built via `tsup --target=deno-deploy` or similar). Maintained via CI parity test.

## Consequences

**Positive**
- Lowest latency to the database (same region).
- Native access to Supabase Auth context (`Deno.env`, `supabase-js`).
- One vendor for backend + functions = simpler ops.
- Free tier generous for v1 traffic.

**Negative**
- Deno ≠ Node. Cannot directly `import` from `packages/core` (Node/TS). Requires a bundle step.
- Edge function cold starts are visible (~200ms). Mitigated by keeping critical functions warm.
- Vendor lock-in to Supabase. Mitigated by keeping all logic in plain TS/Deno and avoiding Supabase-only primitives where possible.

**Neutral**
- All functions deployed via `supabase functions deploy` from CI.
- Local dev via `supabase functions serve`.

## Alternatives considered

- **Vercel Functions only** — rejected; extra hop to DB, more latency on RPC-heavy work.
- **Standalone Node server** — rejected; more ops than a solo dev should run.
- **Mix of all three** — rejected for v1; too many runtimes to learn and monitor.

## Revisit when

- Supabase Edge cold-start or quota becomes a real problem → move hot functions to Vercel.
- A function needs Node-only dependencies that aren't available in Deno → port that one function to Vercel.
- Supabase pricing changes materially → re-evaluate.
