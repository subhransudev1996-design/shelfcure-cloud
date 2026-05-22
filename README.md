# ShelfCure Cloud

Multi-store, multi-user cloud edition of ShelfCure pharmacy management software.

> **Status:** Phase 0 — foundation scaffolding.
> **Planning:** see `../.planning/shelfcure-cloud/` for PRD, Implementation Plan, Master Plan, and ADRs.

## Apps

- `apps/desktop` — Tauri 2.x + React + Vite. Cashier/pharmacist terminal. Offline-first.
- `apps/web` — Next.js 16. Owner/manager dashboard at `cloud.shelfcure.com`. Online-only.
- `apps/website` — Next.js 16. Marketing site `/cloud` section.

## Packages

- `packages/ui` — shared React component kit.
- `packages/core` — pure-TS business logic (GST, bill math, validators, formatters).
- `packages/db-types` — generated TS types from Supabase schema.
- `packages/api-client` — typed Supabase wrapper + RPC functions.
- `packages/sync-engine` — offline outbox, conflict resolution, cursor tracking.
- `packages/hotkeys` — Marg-style keyboard shortcut system.
- `packages/i18n` — translation strings.
- `packages/config` — shared TS/ESLint/Prettier configs.

## Prerequisites

- Node.js `>=20.10.0` (see `.nvmrc`)
- pnpm `>=9.0.0`
- Rust toolchain (for Tauri desktop, Phase 2+)
- Supabase CLI (for migrations, Phase 0+)

## Setup

```bash
pnpm install
cp .env.example .env.local
# fill in .env.local with your Supabase credentials
pnpm typecheck
pnpm lint
```

## Common commands

```bash
pnpm dev              # run all apps in dev mode
pnpm build            # build everything
pnpm lint             # lint everything
pnpm typecheck        # typecheck everything
pnpm test             # run all tests
pnpm format           # prettier write
```

## Environment

`.env.local` is gitignored. Never commit secrets. See `.env.example` for the full variable list. Service role keys belong only in `.env.local` and GitHub Actions secrets — never in client apps.
