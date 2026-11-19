/**
 * Process-wide singletons for the SvelteKit server: the database connection (migrated on first
 * use) and the program configuration from environment variables.
 */
import {
	COORDINATOR_EMAIL,
	COORDINATOR_NAME,
	COORDINATOR_PASSWORD,
	DATABASE_URL,
	PROGRAM_ID,
	PROGRAM_JURISDICTION,
	PROGRAM_NAME,
	PROGRAM_TIMEZONE,
	WATCHER_ACCESS_CODE
} from '$app/env/private';
import { timingSafeEqual } from 'node:crypto';
import { connect, type Database } from './db.ts';
import { migrate } from './migrations.ts';
import { countCoordinators, createCoordinator } from './auth.ts';

export const program = {
	id: PROGRAM_ID,
	name: PROGRAM_NAME,
	jurisdiction: PROGRAM_JURISDICTION,
	timeZone: PROGRAM_TIMEZONE
};

let ready: Promise<Database> | undefined;

/** The migrated database. Retries on the next call if startup failed. */
export function getDb(): Promise<Database> {
	ready ??= init().catch((err: unknown) => {
		ready = undefined;
		throw err;
	});
	return ready;
}

async function init(): Promise<Database> {
	const db = await connect(DATABASE_URL);
	if (db.kind === 'pglite') {
		console.warn(
			DATABASE_URL
				? `[courtnotes] using the embedded PGlite database (${DATABASE_URL}).`
				: '[courtnotes] DATABASE_URL is not set: using the embedded PGlite database in ./.data. ' +
						'Set DATABASE_URL to a Postgres connection string for production.'
		);
	}
	const applied = await migrate(db, (msg) => console.log(`[courtnotes] ${msg}`));
	if (applied.length) console.log(`[courtnotes] database is up to date (${applied.join(', ')})`);

	if (COORDINATOR_EMAIL && COORDINATOR_PASSWORD && (await countCoordinators(db)) === 0) {
		const c = await createCoordinator(db, {
			email: COORDINATOR_EMAIL,
			password: COORDINATOR_PASSWORD,
			name: COORDINATOR_NAME
		});
		console.log(`[courtnotes] created first coordinator account for ${c.email}`);
	}
	if (!WATCHER_ACCESS_CODE) {
		console.warn('[courtnotes] WATCHER_ACCESS_CODE is not set: watcher sync is disabled.');
	}
	return db;
}

export const syncEnabled = Boolean(WATCHER_ACCESS_CODE);

/** Constant-time check of the watcher access code sent as `Authorization: Bearer <code>`. */
export function checkAccessCode(header: string | null): boolean {
	if (!WATCHER_ACCESS_CODE || !header) return false;
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	if (!match) return false;
	const given = Buffer.from(match[1].trim().normalize('NFKC'));
	const expected = Buffer.from(WATCHER_ACCESS_CODE.normalize('NFKC'));
	return given.length === expected.length && timingSafeEqual(given, expected);
}
