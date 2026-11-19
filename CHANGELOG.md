# Changelog

All notable changes to Courtnotes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The open data standard has its own
version (`schema_version`), noted in each release.

## [Unreleased]

## [1.0.0] - 2026-11-19

The first release of Courtnotes. Data standard: **v1.0.0**.

### Added

- **Watcher app (installable PWA)**: a dark, silent, big-button phone app for court watch volunteers.
  - Works fully offline: prerendered app shell cached by a service worker, every record saved to
    IndexedDB first, with automatic background sync when signal returns.
  - Shifts (court, courtroom, judge) with suggestions from the program's existing names.
  - Hearing capture: hearing type, defense lawyer, release decision, bail amount with quick-add
    buttons, bail type and prosecution request, release conditions, outcome, the judge's words, notes,
    and optional defendant details (appearance, custody, interpreter, perceived demographics, case
    number).
  - A pausable per-hearing timer, and **Save & next case** to keep up with fast calendars.
  - In-progress hearings autosave and survive reloads; two-tap confirmation for anything destructive.
  - History with per-record sync status and server validation errors, edit and delete, and a JSON
    download of everything on the device.
  - Settings: keep screen awake, persistent storage, access code, version and build number.
- **Coordinator dashboard**: sign-in, live overview with key figures and charts (hearings per day,
  cases per judge, hearing length, release decisions by judge, bail amounts by judge, defense
  representation, outcomes), filters by date range, court and judge, judge and shift tables.
- **Records review**: browse every hearing, and exclude or re-include records from all statistics.
- **Exports**: hearings and shifts as CSV (Excel-friendly, formula-injection safe), the full dataset
  as open-standard JSON, and public variants without case numbers, notes or volunteer names.
- **Ready-to-publish report**: a printable page with plain-language findings, charts, a judge
  table and methodology.
- **Open data standard v1.0.0** (CC0): JSON Schemas for court observations and shifts, shared
  controlled vocabularies, examples and documentation.
- **Server**: SvelteKit + adapter-node; Postgres via `pg`, or embedded PGlite when no
  `DATABASE_URL` is set; automatic migrations; schema validation of every synced record;
  last-writer-wins sync with per-observer ownership; scrypt passwords and hashed session tokens;
  rate limiting; CSP and security headers; `/api/health` with version and build number.
- **CLI**: `db:migrate`, `db:seed` (synthetic demo data), `coordinator:create`.
- **Tooling**: unit and integration tests (Vitest, PGlite and Postgres 16/17), end-to-end tests
  including offline mode (Playwright), CI, CodeQL, Dependabot, multi-arch Docker images on GHCR,
  and tagged releases with build numbers, changelog notes and checksums.

[Unreleased]: https://github.com/lobojoel2003/Courtnotes/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lobojoel2003/Courtnotes/releases/tag/v1.0.0
