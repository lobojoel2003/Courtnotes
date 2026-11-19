/**
 * Helpers for the server test-suite. Tests run against in-memory PGlite by default; set
 * TEST_DATABASE_URL to a Postgres database (it will be wiped!) to run them against Postgres.
 */
import { randomUUID } from 'node:crypto';
import { connect, type Database } from './db.ts';
import { migrate } from './migrations.ts';
import type { Observation, Shift } from '../schema/types.ts';
import { SCHEMA_VERSION } from '../schema/types.ts';

export async function testDatabase(): Promise<Database> {
	const url = process.env.TEST_DATABASE_URL;
	if (!url) {
		const db = await connect('pglite://memory');
		await migrate(db);
		return db;
	}
	// Test files run in parallel: give each database handle its own schema.
	const schema = `test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
	const admin = await connect(url);
	await admin.exec(`create schema ${schema}`);
	await admin.close();
	const scoped = new URL(url);
	scoped.searchParams.set('options', `-c search_path=${schema}`);
	const db = await connect(scoped.toString());
	await migrate(db);
	return {
		...db,
		async close() {
			await db.exec(`drop schema ${schema} cascade`);
			await db.close();
		}
	};
}

export const PROGRAM = { id: 'test-watch', name: 'Test Court Watch', jurisdiction: 'US-PA' };

const plus = (iso: string, seconds: number) =>
	new Date(Date.parse(iso) + seconds * 1000).toISOString();

export function makeShift(observerId: string, overrides: Partial<Shift> = {}): Shift {
	const started = overrides.started_at ?? '2026-03-02T13:55:00Z';
	return {
		schema_version: SCHEMA_VERSION,
		id: randomUUID(),
		program: { id: PROGRAM.id },
		observer: { id: observerId },
		court: { name: 'Example County Justice Center', courtroom: 'B' },
		judge: { name: 'Hon. A. Marlowe' },
		started_at: started,
		ended_at: plus(started, 3 * 3600),
		updated_at: plus(started, 3 * 3600),
		...overrides
	};
}

export function makeObservation(
	observerId: string,
	overrides: Partial<Observation> = {}
): Observation {
	const started = overrides.started_at ?? '2026-03-02T14:14:05Z';
	return {
		schema_version: SCHEMA_VERSION,
		id: randomUUID(),
		program: { id: PROGRAM.id },
		observer: { id: observerId },
		court: { name: 'Example County Justice Center', courtroom: 'B' },
		judge: { name: 'Hon. A. Marlowe' },
		hearing_type: 'arraignment',
		started_at: started,
		ended_at: plus(started, 156),
		duration_seconds: 156,
		counsel: 'public_defender',
		outcome: 'continued',
		release_decision: 'bail_set',
		bail: { amount: 25000, currency: 'USD', type: 'deposit' },
		updated_at: plus(started, 180),
		...overrides
	};
}
