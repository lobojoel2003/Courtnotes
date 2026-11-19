# Architecture

Courtnotes is one SvelteKit application with two very different halves: an offline-first phone app
for volunteers and a server-rendered dashboard for coordinators, joined by a small sync API and an
open data standard.

## The watcher app

- **Static shell.** Everything under `src/routes/(watcher)` has `ssr = false` and `prerender = true`,
  so each screen is a static HTML shell generated at build time. The service worker
  (`src/service-worker/index.ts`) precaches those shells together with every JS, CSS and icon file
  from the build manifest and serves them cache-first. The app therefore opens and works in airplane
  mode, including on a cold start.
- **Local database.** `src/lib/client/store.ts` wraps IndexedDB (via `idb`) with five stores:
  `settings`, `shifts`, `observations`, `drafts` (the hearing being recorded, autosaved every 250 ms)
  and `tombstones` (deletions waiting to reach the server). Records are standard-conformant from
  the moment they're created, with UUIDs generated on the phone.
- **Sync engine.** `src/lib/client/sync.ts` uploads pending records in batches of 200 with a 20 s
  timeout per request. A record is marked synced only if its `updated_at` still matches what was sent,
  so an edit made during an upload is never lost. Rejected records keep the server's validation
  message so the volunteer can fix them. `app.svelte.ts` triggers sync after saves (debounced), on
  `online` and `visibilitychange`, and every 30 s while anything is pending.
- **Updates.** A new service worker waits until the volunteer taps **Reload**; it never reloads the
  page in the middle of a hearing.

## The server

- **Runtime.** SvelteKit 3 with `adapter-node`. Configuration comes from validated environment
  variables declared in `src/env.ts`.
- **Database.** `src/lib/server/db.ts` exposes a tiny `query` / `exec` / `transaction` interface with
  two implementations: Postgres through `pg`, and PGlite (Postgres compiled to WebAssembly) for
  zero-setup development, demos and tests. Both use the same SQL. Migrations live in
  `src/lib/server/migrations.ts`, run on startup under an advisory lock, and are recorded in
  `schema_migrations`.
- **Storage model.** `shifts` and `observations` keep the full standard record in a `record jsonb`
  column, plus extracted columns (`started_at`, `judge_name`, `court_name`, …) for filtering and
  indexes. Deletions are soft (`deleted_at`); coordinators can `exclude` records without deleting them.
- **Sync API.** `POST /api/sync` requires `Authorization: Bearer <WATCHER_ACCESS_CODE>`. The server
  normalises whitespace in names, stamps its own program block, validates every record against the
  JSON Schema (Ajv 2020-12) and upserts with last-writer-wins on `updated_at`. A record can only be
  changed by the observer id that created it. The response lists accepted ids and per-record
  validation issues.
- **Coordinators.** Accounts in `coordinators` with scrypt password hashes; sessions are random
  256-bit tokens in an `HttpOnly` cookie, stored server-side as SHA-256 hashes. Sign-in and access
  codes are rate limited per client address.

## Statistics and charts

`src/lib/stats.ts` turns standard records into the figures on the dashboard and in the report. The
denominators are part of the standard's documentation: money-bail and ROR rates are shares of
release decisions (excluding `not_addressed`); the no-lawyer rate is a share of hearings where
counsel was recorded and not `unknown`. Days are bucketed in `PROGRAM_TIMEZONE`.

Charts (`src/lib/charts.ts`) use Observable Plot, loaded on demand in the browser. They follow one
set of rules: categorical colours in a fixed order from a palette validated for colour-vision
deficiencies on both the dark dashboard and the white report, bars at most 24 px thick with rounded
data ends, hairline grids, a tooltip on every mark, and every value repeated in a table.

## Exports and the open standard

The JSON Schemas in `schema/v1` are the single source of truth: the TypeScript types mirror them
(and a test fails if they drift), the app's labels are read from them, the server validates against
them, and the JSON export is a list of conforming records. CSV columns are stable and only ever
appended to. Public exports drop `case_number`, `notes` and observer names.

## Versioning

`vite.config.ts` injects the package version, the CI build number (`BUILD_NUMBER`, defaulting to
`GITHUB_RUN_NUMBER`) and the commit into the bundle. The same string names the SvelteKit version
and the service worker cache, so each release replaces the offline cache exactly once.
