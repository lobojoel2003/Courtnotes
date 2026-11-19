# Deploying Courtnotes

Courtnotes is a single Node.js server plus a Postgres database. Any host that runs a Docker
container or Node 22 works: a small VPS, Fly.io, Render, Railway, a university server.

## Requirements

- **HTTPS.** Service workers (offline mode) and "Add to Home Screen" only work on secure origins.
- **Postgres 14+** for real programs. (Without `DATABASE_URL` the server uses an embedded PGlite
  database in `/app/.data`; that's fine for a pilot, but back it up and keep to one process.)
- About 256 MB of RAM.

## Docker Compose

```bash
cp .env.example .env    # set PROGRAM_*, WATCHER_ACCESS_CODE, COORDINATOR_*, ORIGIN, POSTGRES_PASSWORD
docker compose up -d
docker compose logs -f app
```

Pin a version in production by changing `image:` to e.g. `ghcr.io/lobojoel2003/courtnotes:1.0`
(receives patch releases) or `:1.0.0` (fixed).

## Behind a reverse proxy

Terminate TLS in the proxy and forward to port 3000. Tell Courtnotes how to read the original
request:

```bash
ORIGIN=https://watch.example.org
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
ADDRESS_HEADER=x-forwarded-for   # so rate limiting sees real client addresses
XFF_DEPTH=1
```

Example Caddy configuration:

```
watch.example.org {
	reverse_proxy localhost:3000
}
```

Make sure the proxy allows request bodies of at least `BODY_SIZE_LIMIT` (6 MB in the Docker image),
so a volunteer's whole day of offline records can sync at once.

## Without Docker

```bash
npm ci && npm run build && npm prune --omit=dev
DATABASE_URL=postgres://… WATCHER_ACCESS_CODE=… ORIGIN=https://… node build
```

Or download a release tarball, unpack it and run `npm ci --omit=dev && node build`.

## Coordinators

The first coordinator is created from `COORDINATOR_EMAIL` / `COORDINATOR_PASSWORD` when the
database has none. Add more, or reset a password:

```bash
docker compose exec app node scripts/create-coordinator.ts --email pat@example.org --name "Pat"
```

(With the embedded PGlite database, stop the server first: only one process may open it.)

## Backups

```bash
docker compose exec db pg_dump -U courtnotes courtnotes | gzip > courtnotes-$(date +%F).sql.gz
```

Also export the full JSON dataset from the dashboard from time to time: it is a portable,
standard-conformant copy that any tool can read.

## Upgrades

```bash
docker compose pull && docker compose up -d
```

Migrations run automatically on startup and are safe with several replicas (they take an advisory
lock). Read the [CHANGELOG](../CHANGELOG.md) before upgrading across a major version.

## Health checks

`GET /api/health` returns `200` with the version, build number, commit and database status, or `503`
if the database is unreachable. The Docker image's `HEALTHCHECK` uses it.
