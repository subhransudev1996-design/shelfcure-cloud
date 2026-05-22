# ADR-0016: Audit log partitioned monthly from day one

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Schema (`audit_log`), edge function (`audit-log-monthly-partition`), Phase 1

## Context

Every CRUD on critical tables (sales, purchases, stock corrections, transfers, users, settings) writes to `audit_log`. At a single Tier 3 chain with 50 stores × 1000 events/day = 50k rows/day = ~18M rows/year. Across many orgs, hundreds of millions by v1.1.

A single unpartitioned table at that size is painful to back up, query, and drop old data from. Partitioning by month makes:
- Recent-data queries fast (only scan current/recent partitions).
- Old-data archival cheap (drop a partition vs delete millions of rows).
- Vacuum and reindex fast (per partition).

Retrofitting partitioning to a 100M-row table later requires a multi-day migration with downtime. Doing it from day one costs nothing.

## Decision

`audit_log` is a **Postgres range-partitioned table** by `created_at`, with one partition per calendar month:

```sql
create table audit_log (
  id bigserial,
  org_id uuid not null,
  store_id uuid,
  user_id uuid,
  entity text not null,
  entity_id text not null,
  action text not null,
  before jsonb,
  after jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
) partition by range (created_at);

-- One partition per month: audit_log_2026_05, audit_log_2026_06, ...
```

- Edge function `audit-log-monthly-partition` runs on the 25th of each month via cron, creates next month's partition.
- Indexes: `(org_id, created_at desc)`, `(entity, entity_id)` on each partition.
- 7-year retention: partitions older than 7 years archived to cold storage and detached (not dropped — tax law).
- Default partition exists as a safety net; alerts if anything lands there.

## Consequences

**Positive**
- Queries against recent activity stay fast even at 100M+ rows.
- Old data archival is one DDL statement.
- Vacuum and reindex per partition.

**Negative**
- One more cron job to monitor.
- Slightly more complex schema migrations (must `attach partition` patterns).
- Queries spanning many partitions need a partition pruning predicate (always include `created_at` filter).

**Neutral**
- Audit log inserts are async (background tokio task) so partition routing latency is invisible to users.

## Alternatives considered

- **Single unpartitioned table** — rejected; will be painful by v1.1.
- **Weekly partitions** — rejected; too many partitions, more cron complexity.
- **Quarterly partitions** — rejected; harder to drop old data at fine granularity.
- **Separate table per org** — rejected; doesn't scale to many orgs.

## Revisit when

- Audit log query patterns change (e.g. need cross-org queries) → reconsider partition key.
- Storage cost dominates → tighten retention (with legal sign-off).
- Postgres adds better declarative partitioning features → adopt.
