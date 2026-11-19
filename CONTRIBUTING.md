# Contributing to Courtnotes

Thanks for helping court watch programs! Contributions of every size are welcome: bug reports from
the courtroom, translations, docs, code, and especially feedback from programs on the data standard.

## Getting started

You need Node.js 22.18+ (see `.nvmrc`). No database is required: without `DATABASE_URL` the app uses
an embedded PGlite database in `./.data`.

```bash
npm ci
npm run db:seed        # optional synthetic data
npm run dev            # http://localhost:5173
```

Set `WATCHER_ACCESS_CODE`, `COORDINATOR_EMAIL` and `COORDINATOR_PASSWORD` (e.g. in a `.env` file;
see `.env.example`) to use sync and the dashboard.

To test against real Postgres:

```bash
docker run -d --name courtnotes-pg -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:17-alpine
TEST_DATABASE_URL=postgres://postgres:pg@localhost:5432/postgres npm run test:unit
```

## Before you open a pull request

```bash
npm run lint
npm run check
npm run test:unit
npm run build && npm run test:e2e   # UI, offline or sync changes
```

- Add an entry under **Unreleased** in `CHANGELOG.md`.
- Keep the watcher app usable one-handed on a small phone, silent, and fully functional offline.
- Never commit real court-watch data, names, access codes or credentials, including in tests and
  screenshots. Use `npm run db:seed` for demo data.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org)
  (`feat:`, `fix:`, `docs:`, `chore:` …).

## Changing the data standard

The schema in `schema/` is shared by every program that adopts it, so changes are conservative:

- **Minor** (1.x): add an optional field or a vocabulary term. Update `common.schema.json` or the
  record schema, `src/lib/schema/types.ts`, the examples and `schema/README.md`, and bump
  `SCHEMA_VERSION`. Existing records must stay valid.
- **Major** (2.0): anything that could invalidate existing records goes in a new `schema/v2/`
  directory, with a migration path.

Please open an issue to discuss schema changes before sending code.

## Releasing

Releases are cut from `main` by maintainers:

1. Move the **Unreleased** entries in `CHANGELOG.md` under a new `## [x.y.z] - YYYY-MM-DD` heading
   and update the compare links at the bottom.
2. Bump the version, which also creates the commit and the `vx.y.z` tag:

   ```bash
   npm version minor -m "chore(release): v%s"
   ```

3. Push the commit and the tag:

   ```bash
   git push --follow-tags
   ```

The [release workflow](.github/workflows/release.yml) verifies that the tag matches `package.json`
and the changelog, re-runs every check, builds with the CI run number as the **build number**, and
publishes the GitHub Release (notes, tarball, schema zip, `SHA256SUMS`) and the Docker images
(`x.y.z`, `x.y`, `x`, `latest`). It can also be started by hand from the Actions tab with a version
number, in which case it creates the tag itself.
