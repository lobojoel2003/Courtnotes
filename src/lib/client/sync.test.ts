import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Database } from '../server/db.ts';
import {
	applySync,
	listObservations as serverObservations,
	type SyncPayload
} from '../server/records.ts';
import { makeObservation, makeShift, PROGRAM, testDatabase } from '../server/test-helpers.ts';
import * as store from './store.ts';
import { fetchConfig, runSync } from './sync.ts';
import { emptyForm } from './hearing.ts';

let server: Database;
let requests = 0;
let beforeRespond: (() => Promise<void>) | undefined;

/** A fetch that routes /api/sync straight into the real server code. */
const serverFetch: typeof fetch = async (input, init) => {
	requests++;
	const url = input instanceof Request ? input.url : input.toString();
	const auth = new Headers(init?.headers).get('authorization');
	if (auth !== 'Bearer letmein') {
		return Response.json({ message: 'The access code was not recognised.' }, { status: 401 });
	}
	if (url === '/api/config') {
		return Response.json({
			program: { id: PROGRAM.id, name: PROGRAM.name, jurisdiction: PROGRAM.jurisdiction },
			directory: { courts: [{ name: 'Court', courtrooms: ['1'] }], judges: ['Hon. A. Marlowe'] }
		});
	}
	const payload = JSON.parse(init?.body as string) as SyncPayload;
	const result = await applySync(server, payload, PROGRAM);
	await beforeRespond?.();
	return Response.json(result);
};

const offlineFetch: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));

beforeAll(async () => {
	server = await testDatabase();
});

afterAll(async () => {
	await server?.close();
});

beforeEach(() => {
	// A brand-new IndexedDB for every test.
	globalThis.indexedDB = new IDBFactory();
	store.resetDatabaseHandle();
	requests = 0;
	beforeRespond = undefined;
});

async function setUpDevice() {
	const settings = await store.saveSettings({ observerName: 'Sam', accessCode: 'letmein' });
	const shift = makeShift(settings.observerId);
	await store.putShift(shift);
	return { settings, shift };
}

describe('runSync', () => {
	it('does nothing until an access code is configured', async () => {
		expect((await runSync({ fetch: serverFetch })).status).toBe('not_configured');
		await store.saveSettings({ accessCode: 'letmein' });
		expect((await runSync({ fetch: serverFetch })).status).toBe('nothing');
		expect(requests).toBe(0);
	});

	it('uploads queued shifts and hearings and marks them synced', async () => {
		const { settings, shift } = await setUpDevice();
		await store.putObservation(makeObservation(settings.observerId, { shift_id: shift.id }));
		await store.putObservation(makeObservation(settings.observerId, { shift_id: shift.id }));
		expect(await store.counts()).toEqual({ pending: 3, rejected: 0 });

		const outcome = await runSync({ fetch: serverFetch, batchSize: 2 });
		expect(outcome).toMatchObject({ status: 'ok', accepted: 3, rejected: 0 });
		expect(requests).toBe(2);
		expect(await store.counts()).toEqual({ pending: 0, rejected: 0 });
		expect((await store.getSettings())?.lastSyncAt).toBeTypeOf('number');
		const onServer = await serverObservations(server, {}, 'UTC');
		expect(onServer.filter((o) => o.shift_id === shift.id)).toHaveLength(2);
	});

	it('keeps records pending when offline and retries later', async () => {
		const { settings, shift } = await setUpDevice();
		await store.putObservation(makeObservation(settings.observerId, { shift_id: shift.id }));
		expect((await runSync({ fetch: offlineFetch })).status).toBe('offline');
		expect((await store.counts()).pending).toBe(2);
		expect((await runSync({ fetch: serverFetch })).status).toBe('ok');
		expect((await store.counts()).pending).toBe(0);
	});

	it('does not lose an edit made while the upload was in flight', async () => {
		const { settings, shift } = await setUpDevice();
		const o = makeObservation(settings.observerId, { shift_id: shift.id, notes: 'first' });
		await store.putObservation(o);
		beforeRespond = async () => {
			await store.putObservation({ ...o, notes: 'second', updated_at: new Date().toISOString() });
		};
		await runSync({ fetch: serverFetch });
		expect((await store.getObservation(o.id))?.sync).toBe('pending');
		beforeRespond = undefined;
		await runSync({ fetch: serverFetch });
		expect((await store.getObservation(o.id))?.sync).toBe('synced');
		const [onServer] = (await serverObservations(server, {}, 'UTC')).filter((r) => r.id === o.id);
		expect(onServer.notes).toBe('second');
	});

	it('flags records the server rejects, with the reason', async () => {
		const { settings, shift } = await setUpDevice();
		const bad = makeObservation(settings.observerId, {
			shift_id: shift.id,
			ended_at: '2020-01-01T00:00:00Z'
		});
		await store.putObservation(bad);
		const outcome = await runSync({ fetch: serverFetch });
		expect(outcome).toMatchObject({ status: 'ok', rejected: 1 });
		const local = await store.getObservation(bad.id);
		expect(local?.sync).toBe('rejected');
		expect(local?.error).toContain('/ended_at');
		expect(await store.counts()).toEqual({ pending: 0, rejected: 1 });
	});

	it('reports a wrong access code without touching the queue', async () => {
		await setUpDevice();
		await store.saveSettings({ accessCode: 'wrong' });
		const outcome = await runSync({ fetch: serverFetch });
		expect(outcome.status).toBe('unauthorized');
		expect(outcome.message).toMatch(/not recognised/);
		expect((await store.counts()).pending).toBe(1);
	});

	it('propagates deletions as tombstones', async () => {
		const { settings, shift } = await setUpDevice();
		const o = makeObservation(settings.observerId, { shift_id: shift.id });
		await store.putObservation(o);
		await runSync({ fetch: serverFetch });
		await store.deleteShift(shift.id);
		expect(await store.listObservations(shift.id)).toEqual([]);
		expect((await store.counts()).pending).toBe(2);
		await runSync({ fetch: serverFetch });
		expect((await store.counts()).pending).toBe(0);
		expect((await serverObservations(server, {}, 'UTC')).some((r) => r.id === o.id)).toBe(false);
	});
});

describe('fetchConfig', () => {
	it('stores program settings and the directory', async () => {
		await store.saveSettings({});
		expect((await fetchConfig('nope', { fetch: serverFetch })).status).toBe('unauthorized');
		expect((await fetchConfig('letmein', { fetch: offlineFetch })).status).toBe('offline');
		expect((await fetchConfig('letmein', { fetch: serverFetch })).status).toBe('ok');
		const settings = await store.getSettings();
		expect(settings?.program?.name).toBe(PROGRAM.name);
		expect(settings?.directory.judges).toEqual(['Hon. A. Marlowe']);
	});
});

describe('drafts and device data', () => {
	it('keeps the in-progress hearing and exports the device', async () => {
		const { settings, shift } = await setUpDevice();
		await store.putDraft({
			id: 'd1',
			shiftId: shift.id,
			editing: false,
			form: { ...emptyForm(), hearing_type: 'arraignment' },
			timer: { firstStartedAt: 1, runningSince: 1, accumulatedMs: 0 },
			updatedAt: 0
		});
		expect((await store.currentDraft())?.form.hearing_type).toBe('arraignment');
		await store.putObservation(makeObservation(settings.observerId, { shift_id: shift.id }));
		const exported = await store.exportDevice();
		expect(exported.shifts).toHaveLength(1);
		expect(exported.observations).toHaveLength(1);
		expect((await store.activeShift())?.id).toBeUndefined(); // test shifts are already ended
		await store.eraseDevice();
		expect(await store.listShifts()).toEqual([]);
		expect(await store.currentDraft()).toBeUndefined();
		expect((await store.getSettings())?.observerId).toBe(settings.observerId);
	});
});
