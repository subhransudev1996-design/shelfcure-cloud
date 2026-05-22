# Database tests

pgTAP-based RLS and RPC tests for the Supabase schema.

## How to run

Requires Docker Desktop (for local Supabase).

```bash
# from shelfcure-cloud/
npx supabase start          # boots local Postgres + GoTrue + everything
npx supabase test db        # applies migrations + runs all *.test.sql under supabase/tests/
```

To inspect a failing test interactively:

```bash
npx supabase db reset       # fresh DB with migrations applied
psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/database/02_rls_stores.test.sql
```

## Convention

Each test file:
- Wraps in `begin ... rollback` so state never leaks between runs.
- Declares `select plan(N)` upfront.
- Ends with `select * from finish();`.
- Uses a `pg_temp.as_user(uid)` helper to switch JWT identity for RLS testing.
- Seeds its own fixtures (do not depend on other test files).

## Coverage matrix (current)

| Test file | Tables | Roles |
|---|---|---|
| `01_helpers_and_onboarding.test.sql` | organizations, user_profiles | new user, super_admin |
| `02_rls_stores.test.sql` | stores | super_admin, store_admin, pharmacist, cashier, accountant |
| `03_rls_user_profiles.test.sql` | user_profiles | super_admin, cashier (cross-org isolation) |

Every new business table added in future migrations gets a matching test file covering the full role × action matrix. See plan §10 (Phase 1 exit criteria).

## CI

GitHub Actions runs `supabase db reset && supabase test db` on every PR that touches `supabase/`. Failing tests block merge. (Workflow wired in Phase 0 Day 7 once Docker-in-Actions is set up.)
