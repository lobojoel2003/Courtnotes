import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Database } from './db.ts';
import { migrate } from './migrations.ts';
import {
	authenticate,
	countCoordinators,
	createCoordinator,
	createSession,
	deleteSession,
	getSessionCoordinator,
	hashPassword,
	verifyPassword
} from './auth.ts';
import {
	applySync,
	cleanText,
	directory,
	filterOptions,
	listObservations,
	listShifts,
	pageObservations,
	parseFilters,
	setExcluded
} from './records.ts';
import { makeObservation, makeShift, PROGRAM, testDatabase } from './test-helpers.ts';
import { RateLimiter } from './rate-limit.ts';

let db: Database;

beforeAll(async () => {
	db = await testDatabase();
});

afterAll(async () => {
	await db?.close();
});

describe('migrations', () => {
	it('are idempotent', async () => {
		expect(await migrate(db)).toEqual([]);
		const { rows } = await db.query<{ id: string }>('select id from schema_migrations');
		expect(rows.map((r) => r.id)).toContain('001_initial');
	});
});

describe('passwords and sessions', () => {
	it('hashes and verifies passwords', async () => {
		const hash = await hashPassword('correct horse battery');
		expect(hash.startsWith('scrypt$')).toBe(true);
		expect(await verifyPassword('correct horse battery', hash)).toBe(true);
		expect(await verifyPassword('wrong horse battery', hash)).toBe(false);
		expect(await verifyPassword('anything', 'garbage')).toBe(false);
	});

	it('creates coordinators, authenticates and manages sessions', async () => {
		await expect(
			createCoordinator(db, { email: 'x', name: 'X', password: 'longenough!' })
		).rejects.toThrow(/email/);
		await expect(
			createCoordinator(db, { email: 'a@b.org', name: 'A', password: 'short' })
		).rejects.toThrow(/at least/);

		const c = await createCoordinator(db, {
			email: '  Coordinator@Example.ORG ',
			name: 'Pat',
			password: 'a long passphrase'
		});
		expect(c.email).toBe('coordinator@example.org');
		expect(await countCoordinators(db)).toBe(1);

		expect(await authenticate(db, 'coordinator@example.org', 'nope nope nope')).toBeNull();
		expect(await authenticate(db, 'nobody@example.org', 'a long passphrase')).toBeNull();
		const signedIn = await authenticate(db, 'COORDINATOR@example.org', 'a long passphrase');
		expect(signedIn?.id).toBe(c.id);

		const { token } = await createSession(db, c.id);
		expect((await getSessionCoordinator(db, token))?.email).toBe('coordinator@example.org');
		expect(await getSessionCoordinator(db, token + 'x')).toBeNull();
		// The raw token is never stored.
		const { rows } = await db.query<{ id: string }>('select id from sessions');
		expect(rows.some((r) => r.id === token)).toBe(false);

		await deleteSession(db, token);
		expect(await getSessionCoordinator(db, token)).toBeNull();
	});
});

describe('sync', () => {
	const observer = randomUUID();

	it('accepts valid shifts and observations and stamps the program', async () => {
		const shift = makeShift(observer, {
			court: { name: '  Example County   Justice Center ', courtroom: ' B ' }
		});
		const obs = makeObservation(observer, {
			shift_id: shift.id,
			judge: { name: 'Hon.  A. Marlowe' },
			program: { id: 'something-else' }
		});
		const result = await applySync(
			db,
			{ observer: { id: observer, name: 'Sam' }, shifts: [shift], observations: [obs] },
			PROGRAM
		);
		expect(result.rejected).toEqual([]);
		expect(result.accepted.shifts).toEqual([shift.id]);
		expect(result.accepted.observations).toEqual([obs.id]);

		const [stored] = await listObservations(db, {}, 'UTC');
		expect(stored.program).toEqual({ id: PROGRAM.id, name: PROGRAM.name });
		expect(stored.judge?.name).toBe('Hon. A. Marlowe');
		expect(stored.court.jurisdiction).toBe('US-PA');

		const shifts = await listShifts(db, {}, 'UTC');
		expect(shifts[0].record.court).toMatchObject({
			name: 'Example County Justice Center',
			courtroom: 'B'
		});
		expect(shifts[0].observer_name).toBe('Sam');
		expect(shifts[0].hearings).toBe(1);
	});

	it('rejects invalid records with readable issues but keeps the valid ones', async () => {
		const good = makeObservation(observer);
		const bad = { ...makeObservation(observer), hearing_type: 'nonsense' };
		const result = await applySync(
			db,
			{ observer: { id: observer }, observations: [good, bad] },
			PROGRAM
		);
		expect(result.accepted.observations).toEqual([good.id]);
		expect(result.rejected).toHaveLength(1);
		expect(result.rejected[0]).toMatchObject({ kind: 'observation', id: bad.id });
		expect(result.rejected[0].issues[0].path).toBe('/hearing_type');
	});

	it('rejects records whose observer does not match the device', async () => {
		const result = await applySync(
			db,
			{ observer: { id: observer }, observations: [makeObservation(randomUUID())] },
			PROGRAM
		);
		expect(result.accepted.observations).toEqual([]);
		expect(result.rejected[0].issues[0].path).toBe('/observer/id');
	});

	it('is last-writer-wins and never lets one observer overwrite another', async () => {
		const original = makeObservation(observer, { notes: 'v2', updated_at: '2026-03-02T15:00:00Z' });
		await applySync(db, { observer: { id: observer }, observations: [original] }, PROGRAM);

		// An older copy arriving late is accepted (so the device stops resending) but ignored.
		const stale = { ...original, notes: 'v1', updated_at: '2026-03-02T14:30:00Z' };
		const r1 = await applySync(db, { observer: { id: observer }, observations: [stale] }, PROGRAM);
		expect(r1.accepted.observations).toEqual([original.id]);
		let [row] = (await listObservations(db, {}, 'UTC')).filter((o) => o.id === original.id);
		expect(row.notes).toBe('v2');

		const newer = { ...original, notes: 'v3', updated_at: '2026-03-02T16:00:00Z' };
		await applySync(db, { observer: { id: observer }, observations: [newer] }, PROGRAM);
		[row] = (await listObservations(db, {}, 'UTC')).filter((o) => o.id === original.id);
		expect(row.notes).toBe('v3');

		const intruder = randomUUID();
		const hijack = {
			...original,
			observer: { id: intruder },
			notes: 'hijacked',
			updated_at: '2026-03-03T00:00:00Z'
		};
		const r2 = await applySync(db, { observer: { id: intruder }, observations: [hijack] }, PROGRAM);
		expect(r2.accepted.observations).toEqual([]);
		expect(r2.rejected[0].issues[0].message).toMatch(/another observer/);
		[row] = (await listObservations(db, {}, 'UTC')).filter((o) => o.id === original.id);
		expect(row.notes).toBe('v3');
	});

	it('soft-deletes only the observer’s own records', async () => {
		const mine = makeObservation(observer);
		await applySync(db, { observer: { id: observer }, observations: [mine] }, PROGRAM);
		await applySync(
			db,
			{ observer: { id: randomUUID() }, deleted: { observations: [mine.id] } },
			PROGRAM
		);
		expect((await listObservations(db, {}, 'UTC')).some((o) => o.id === mine.id)).toBe(true);
		const result = await applySync(
			db,
			{ observer: { id: observer }, deleted: { observations: [mine.id, 'not-a-uuid'] } },
			PROGRAM
		);
		expect(result.accepted.deleted).toEqual([mine.id]);
		expect((await listObservations(db, {}, 'UTC')).some((o) => o.id === mine.id)).toBe(false);
	});
});

describe('queries', () => {
	const observer = randomUUID();
	let fresh: Database;

	beforeAll(async () => {
		fresh = await testDatabase();
		const shifts = [
			makeShift(observer, { started_at: '2026-04-01T13:00:00Z' }),
			makeShift(observer, {
				started_at: '2026-04-02T13:00:00Z',
				judge: { name: 'Hon. R. Castellan' },
				court: { name: 'Northside Municipal Court', courtroom: '3' }
			})
		];
		const observations = [
			// 11:30 pm in New York on April 1 is already April 2 in UTC.
			makeObservation(observer, { shift_id: shifts[0].id, started_at: '2026-04-02T03:30:00Z' }),
			makeObservation(observer, { shift_id: shifts[0].id, started_at: '2026-04-01T14:00:00Z' }),
			makeObservation(observer, {
				shift_id: shifts[1].id,
				started_at: '2026-04-02T14:00:00Z',
				judge: { name: 'Hon. R. Castellan' },
				court: { name: 'Northside Municipal Court', courtroom: '3' },
				release_decision: 'released_ror',
				bail: undefined
			})
		];
		const r = await applySync(fresh, { observer: { id: observer }, shifts, observations }, PROGRAM);
		expect(r.rejected).toEqual([]);
	});

	afterAll(async () => {
		await fresh?.close();
	});

	it('filters by calendar day in the program time zone', async () => {
		const ny = await listObservations(
			fresh,
			{ from: '2026-04-01', to: '2026-04-01' },
			'America/New_York'
		);
		expect(ny).toHaveLength(2);
		const utc = await listObservations(fresh, { from: '2026-04-01', to: '2026-04-01' }, 'UTC');
		expect(utc).toHaveLength(1);
	});

	it('filters by court and judge', async () => {
		expect(await listObservations(fresh, { judge: 'Hon. R. Castellan' }, 'UTC')).toHaveLength(1);
		expect(
			await listObservations(fresh, { court: 'Northside Municipal Court' }, 'UTC')
		).toHaveLength(1);
		expect(await listShifts(fresh, { judge: 'Hon. R. Castellan' }, 'UTC')).toHaveLength(1);
	});

	it('excludes records flagged by a coordinator', async () => {
		const [first] = await listObservations(fresh, {}, 'UTC');
		expect(await setExcluded(fresh, first.id, true, 'training session')).toBe(true);
		expect(await listObservations(fresh, {}, 'UTC')).toHaveLength(2);
		expect(await listObservations(fresh, {}, 'UTC', { includeExcluded: true })).toHaveLength(3);
		const page = await pageObservations(fresh, {}, 'UTC', { limit: 2, offset: 0 });
		expect(page.total).toBe(3);
		expect(page.rows).toHaveLength(2);
		expect(
			page.rows.find((r) => r.record.id === first.id)?.excluded_reason ?? 'training session'
		).toBe('training session');
		await setExcluded(fresh, first.id, false);
		expect(await setExcluded(fresh, 'nope', true)).toBe(false);
	});

	it('lists known courts and judges for watcher suggestions', async () => {
		const dir = await directory(fresh);
		expect(dir.courts.map((c) => c.name).sort()).toEqual([
			'Example County Justice Center',
			'Northside Municipal Court'
		]);
		expect(dir.judges).toContain('Hon. R. Castellan');
		const options = await filterOptions(fresh);
		expect(options.judges).toEqual(['Hon. A. Marlowe', 'Hon. R. Castellan']);
	});
});

describe('helpers', () => {
	it('parses filters defensively', () => {
		const f = parseFilters(
			new URLSearchParams('from=2026-01-01&to=nope&court=%20Main%20&judge=&x=1')
		);
		expect(f).toEqual({ from: '2026-01-01', court: 'Main' });
	});

	it('cleans whitespace', () => {
		expect(cleanText('  Hon.\tA.\n  Marlowe ')).toBe('Hon. A. Marlowe');
	});

	it('rate limits after repeated failures and resets', () => {
		const limiter = new RateLimiter(3, 1000);
		for (let i = 0; i < 3; i++) limiter.hit('ip', 0);
		expect(limiter.retryAfter('ip', 10)).toBe(1);
		expect(limiter.retryAfter('ip', 1001)).toBe(0);
		limiter.hit('other', 0);
		limiter.reset('other');
		expect(limiter.retryAfter('other', 0)).toBe(0);
	});
});
