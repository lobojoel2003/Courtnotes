/**
 * The watcher's on-device database (IndexedDB). Everything a volunteer records lands here first,
 * so the app works with no signal in a basement courtroom; the sync engine uploads it later.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Observation, Shift } from '../schema/types.ts';
import type { HearingForm, Timer } from './hearing.ts';

export type SyncState = 'pending' | 'synced' | 'rejected';

export interface LocalRecord<T> {
	id: string;
	record: T;
	sync: SyncState;
	/** Why the server rejected the record, if it did. */
	error?: string;
	savedAt: number;
}

export interface LocalShift extends LocalRecord<Shift> {
	/** The judge currently on the bench; new hearings default to this. */
	currentJudge?: string;
}

export type LocalObservation = LocalRecord<Observation>;

export interface Tombstone {
	id: string;
	kind: 'shift' | 'observation';
}

export interface DirectoryCache {
	courts: { name: string; courtrooms: string[] }[];
	judges: string[];
}

export interface Settings {
	observerId: string;
	observerName: string;
	accessCode: string;
	program: { id: string; name: string; jurisdiction: string | null } | null;
	directory: DirectoryCache;
	lastSyncAt: number | null;
	lastConfigAt: number | null;
	keepAwake: boolean;
}

/** Form state of a hearing being recorded, persisted on every change so nothing is ever lost. */
export interface Draft {
	id: string;
	shiftId: string;
	/** Set when editing a saved hearing rather than recording a new one. */
	editing: boolean;
	form: HearingForm;
	timer: Timer;
	updatedAt: number;
}

interface CourtnotesDB extends DBSchema {
	settings: { key: string; value: Settings };
	shifts: { key: string; value: LocalShift; indexes: { sync: SyncState } };
	observations: {
		key: string;
		value: LocalObservation;
		indexes: { shift: string; sync: SyncState };
	};
	drafts: { key: string; value: Draft };
	tombstones: { key: string; value: Tombstone };
}

const DB_NAME = 'courtnotes';
const SETTINGS_KEY = 'device';

let dbPromise: Promise<IDBPDatabase<CourtnotesDB>> | undefined;

export function database(): Promise<IDBPDatabase<CourtnotesDB>> {
	dbPromise ??= openDB<CourtnotesDB>(DB_NAME, 1, {
		upgrade(db) {
			db.createObjectStore('settings');
			const shifts = db.createObjectStore('shifts', { keyPath: 'id' });
			shifts.createIndex('sync', 'sync');
			const observations = db.createObjectStore('observations', { keyPath: 'id' });
			observations.createIndex('shift', 'record.shift_id');
			observations.createIndex('sync', 'sync');
			db.createObjectStore('drafts', { keyPath: 'id' });
			db.createObjectStore('tombstones', { keyPath: 'id' });
		},
		blocking() {
			// A newer version of the app wants to upgrade the database: let it.
			void dbPromise?.then((db) => db.close());
			dbPromise = undefined;
		}
	});
	return dbPromise;
}

/** For tests: forget the cached connection. */
export function resetDatabaseHandle(): void {
	dbPromise = undefined;
}

export function newId(): string {
	return crypto.randomUUID();
}

// --- settings -------------------------------------------------------------------------------

export async function getSettings(): Promise<Settings | undefined> {
	return (await database()).get('settings', SETTINGS_KEY);
}

export async function saveSettings(update: Partial<Settings>): Promise<Settings> {
	const db = await database();
	const current = (await db.get('settings', SETTINGS_KEY)) ?? {
		observerId: newId(),
		observerName: '',
		accessCode: '',
		program: null,
		directory: { courts: [], judges: [] },
		lastSyncAt: null,
		lastConfigAt: null,
		keepAwake: false
	};
	const next = { ...current, ...update };
	await db.put('settings', next, SETTINGS_KEY);
	return next;
}

// --- shifts ---------------------------------------------------------------------------------

export async function putShift(shift: Shift, extra: Partial<LocalShift> = {}): Promise<LocalShift> {
	const db = await database();
	const existing = await db.get('shifts', shift.id);
	const value: LocalShift = {
		...existing,
		...extra,
		id: shift.id,
		record: shift,
		sync: 'pending',
		error: undefined,
		savedAt: Date.now()
	};
	await db.put('shifts', value);
	return value;
}

export async function getShift(id: string): Promise<LocalShift | undefined> {
	return (await database()).get('shifts', id);
}

export async function listShifts(): Promise<LocalShift[]> {
	const all = await (await database()).getAll('shifts');
	return all.sort((a, b) => b.record.started_at.localeCompare(a.record.started_at));
}

/** The shift that has been started but not ended, if any. */
export async function activeShift(): Promise<LocalShift | undefined> {
	return (await listShifts()).find((s) => !s.record.ended_at);
}

export async function setCurrentJudge(shiftId: string, judge: string): Promise<void> {
	const db = await database();
	const shift = await db.get('shifts', shiftId);
	if (shift) await db.put('shifts', { ...shift, currentJudge: judge });
}

// --- observations ---------------------------------------------------------------------------

export async function putObservation(observation: Observation): Promise<LocalObservation> {
	const value: LocalObservation = {
		id: observation.id,
		record: observation,
		sync: 'pending',
		savedAt: Date.now()
	};
	await (await database()).put('observations', value);
	return value;
}

export async function getObservation(id: string): Promise<LocalObservation | undefined> {
	return (await database()).get('observations', id);
}

export async function listObservations(shiftId?: string): Promise<LocalObservation[]> {
	const db = await database();
	const all = shiftId
		? await db.getAllFromIndex('observations', 'shift', shiftId)
		: await db.getAll('observations');
	return all.sort((a, b) => b.record.started_at.localeCompare(a.record.started_at));
}

// --- deletion -------------------------------------------------------------------------------

/** Delete locally; if the server already has the record, queue a tombstone so it's removed there too. */
export async function deleteObservation(id: string): Promise<void> {
	const db = await database();
	const tx = db.transaction(['observations', 'tombstones', 'drafts'], 'readwrite');
	await tx.objectStore('observations').delete(id);
	await tx.objectStore('drafts').delete(id);
	await tx.objectStore('tombstones').put({ id, kind: 'observation' });
	await tx.done;
}

export async function deleteShift(id: string): Promise<void> {
	const db = await database();
	const hearings = await db.getAllKeysFromIndex('observations', 'shift', id);
	const tx = db.transaction(['shifts', 'observations', 'tombstones'], 'readwrite');
	for (const key of hearings) {
		await tx.objectStore('observations').delete(key);
		await tx.objectStore('tombstones').put({ id: key, kind: 'observation' });
	}
	await tx.objectStore('shifts').delete(id);
	await tx.objectStore('tombstones').put({ id, kind: 'shift' });
	await tx.done;
}

// --- drafts ---------------------------------------------------------------------------------

export async function putDraft(draft: Draft): Promise<void> {
	await (await database()).put('drafts', { ...draft, updatedAt: Date.now() });
}

export async function getDraft(id: string): Promise<Draft | undefined> {
	return (await database()).get('drafts', id);
}

/** The new (not-yet-saved) hearing being recorded, if any. */
export async function currentDraft(): Promise<Draft | undefined> {
	const drafts = await (await database()).getAll('drafts');
	return drafts.filter((d) => !d.editing).sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

export async function deleteDraft(id: string): Promise<void> {
	await (await database()).delete('drafts', id);
}

// --- sync bookkeeping -----------------------------------------------------------------------

export interface Outbox {
	shifts: LocalShift[];
	observations: LocalObservation[];
	tombstones: Tombstone[];
}

export async function outbox(): Promise<Outbox> {
	const db = await database();
	const [shifts, observations, tombstones] = await Promise.all([
		db.getAllFromIndex('shifts', 'sync', 'pending'),
		db.getAllFromIndex('observations', 'sync', 'pending'),
		db.getAll('tombstones')
	]);
	return { shifts, observations, tombstones };
}

export async function counts(): Promise<{ pending: number; rejected: number }> {
	const db = await database();
	const [ps, po, rs, ro, t] = await Promise.all([
		db.countFromIndex('shifts', 'sync', 'pending'),
		db.countFromIndex('observations', 'sync', 'pending'),
		db.countFromIndex('shifts', 'sync', 'rejected'),
		db.countFromIndex('observations', 'sync', 'rejected'),
		db.count('tombstones')
	]);
	return { pending: ps + po + t, rejected: rs + ro };
}

/**
 * Mark records as synced — but only if they haven't been edited since they were sent, otherwise
 * the newer local edit would never be uploaded.
 */
export async function markSynced(
	store: 'shifts' | 'observations',
	sent: Map<string, string>,
	ids: string[]
): Promise<void> {
	const db = await database();
	const tx = db.transaction(store, 'readwrite');
	for (const id of ids) {
		const current = await tx.store.get(id);
		if (current && current.record.updated_at === sent.get(id)) {
			await tx.store.put({ ...current, sync: 'synced', error: undefined });
		}
	}
	await tx.done;
}

export async function markRejected(
	store: 'shifts' | 'observations',
	id: string,
	sentUpdatedAt: string | undefined,
	error: string
): Promise<void> {
	const db = await database();
	const current = await db.get(store, id);
	if (current && current.record.updated_at === sentUpdatedAt) {
		await db.put(store, { ...current, sync: 'rejected', error });
	}
}

export async function clearTombstones(ids: string[]): Promise<void> {
	const db = await database();
	const tx = db.transaction('tombstones', 'readwrite');
	for (const id of ids) await tx.store.delete(id);
	await tx.done;
}

/** Everything on this device, in the open data format — the volunteer's own backup. */
export async function exportDevice(): Promise<{ shifts: Shift[]; observations: Observation[] }> {
	const db = await database();
	const [shifts, observations] = await Promise.all([
		db.getAll('shifts'),
		db.getAll('observations')
	]);
	return { shifts: shifts.map((s) => s.record), observations: observations.map((o) => o.record) };
}

/** Erase every record on this device (but keep the device id). */
export async function eraseDevice(): Promise<void> {
	const db = await database();
	const tx = db.transaction(['shifts', 'observations', 'drafts', 'tombstones'], 'readwrite');
	await Promise.all([
		tx.objectStore('shifts').clear(),
		tx.objectStore('observations').clear(),
		tx.objectStore('drafts').clear(),
		tx.objectStore('tombstones').clear(),
		tx.done
	]);
}
