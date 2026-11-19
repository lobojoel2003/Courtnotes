/**
 * A tiny database interface with two implementations:
 *
 * - Postgres via `pg` — what production deployments use.
 * - PGlite (Postgres compiled to WebAssembly) — zero-setup local development, demos and tests.
 *
 * Both speak the same SQL dialect and the same `$1` parameter syntax, so the rest of the
 * server code is written once. This module has no SvelteKit imports so CLI scripts can use it.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface QueryResult<T> {
	rows: T[];
}

export interface Queryable {
	query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
	/** Run one or more statements without parameters (used for migrations). */
	exec(sql: string): Promise<void>;
}

export interface Database extends Queryable {
	readonly kind: 'postgres' | 'pglite';
	transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
	close(): Promise<void>;
}

/** Where the embedded database lives when DATABASE_URL is unset. */
export const DEFAULT_PGLITE_DIR = '.data/pglite';

/**
 * Connect using a connection string:
 * - `postgres://…` / `postgresql://…` → Postgres
 * - `pglite://memory` → in-memory PGlite (tests)
 * - `pglite://<dir>` or unset → PGlite persisted in a directory
 */
export async function connect(url?: string): Promise<Database> {
	if (url && /^postgres(ql)?:\/\//.test(url)) return connectPostgres(url);
	const target = url?.startsWith('pglite://') ? url.slice('pglite://'.length) : DEFAULT_PGLITE_DIR;
	return connectPglite(target === 'memory' ? undefined : target);
}

async function connectPostgres(url: string): Promise<Database> {
	const { default: pg } = await import('pg');
	const pool = new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
	pool.on('error', (err) => console.error('[db] idle client error', err));
	// Fail fast with a clear message instead of on the first request.
	await pool.query('select 1');

	return {
		kind: 'postgres',
		async query<T>(text: string, params?: unknown[]) {
			const result = await pool.query(text, params);
			return { rows: result.rows as T[] };
		},
		async exec(sql: string) {
			await pool.query(sql);
		},
		async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
			const client = await pool.connect();
			try {
				await client.query('begin');
				const value = await fn({
					async query<R>(text: string, params?: unknown[]) {
						const result = await client.query(text, params);
						return { rows: result.rows as R[] };
					},
					async exec(sql: string) {
						await client.query(sql);
					}
				});
				await client.query('commit');
				return value;
			} catch (err) {
				await client.query('rollback').catch(() => {});
				throw err;
			} finally {
				client.release();
			}
		},
		close: () => pool.end()
	};
}

function isRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
}

/**
 * PGlite is single-process: two processes opening the same directory can corrupt it. A lock file
 * holding the owner's pid turns that into a clear error (stale locks from crashed processes are
 * ignored).
 */
function lockDirectory(dir: string): () => void {
	const lock = join(dir, '.courtnotes.lock');
	try {
		const pid = Number(readFileSync(lock, 'utf8'));
		if (pid && pid !== process.pid && isRunning(pid)) {
			throw new Error(
				`The embedded database in ${dir} is in use by another process (pid ${pid}). ` +
					'Stop the Courtnotes server first, or use Postgres (DATABASE_URL) to run scripts alongside it.'
			);
		}
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
	}
	writeFileSync(lock, String(process.pid));
	return () => rmSync(lock, { force: true });
}

async function connectPglite(dir: string | undefined): Promise<Database> {
	const { PGlite } = await import('@electric-sql/pglite');
	let unlock = () => {};
	if (dir) {
		mkdirSync(dir, { recursive: true });
		unlock = lockDirectory(dir);
	}
	const db = await PGlite.create(dir);

	return {
		kind: 'pglite',
		async query<T>(text: string, params?: unknown[]) {
			const result = await db.query<T>(text, params);
			return { rows: result.rows };
		},
		async exec(sql: string) {
			await db.exec(sql);
		},
		transaction<T>(fn: (tx: Queryable) => Promise<T>) {
			return db.transaction((tx) =>
				fn({
					async query<R>(text: string, params?: unknown[]) {
						const result = await tx.query<R>(text, params);
						return { rows: result.rows };
					},
					async exec(sql: string) {
						await tx.exec(sql);
					}
				})
			);
		},
		async close() {
			await db.close();
			unlock();
		}
	};
}
