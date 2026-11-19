/**
 * Uploads queued records to the Courtnotes server. Designed for "lie-fi": every request has a
 * timeout, batches are small, and nothing is marked synced until the server says so.
 */
import {
	clearTombstones,
	getSettings,
	markRejected,
	markSynced,
	outbox,
	saveSettings,
	type Settings
} from './store.ts';

export type SyncStatus =
	'ok' | 'nothing' | 'offline' | 'not_configured' | 'unauthorized' | 'disabled' | 'error';

export interface SyncOutcome {
	status: SyncStatus;
	message?: string;
	accepted: number;
	rejected: number;
}

interface Options {
	fetch?: typeof fetch;
	timeoutMs?: number;
	batchSize?: number;
}

interface ServerResult {
	accepted: { shifts: string[]; observations: string[]; deleted: string[] };
	rejected: {
		kind: 'shift' | 'observation';
		id: string | null;
		issues: { path: string; message: string }[];
	}[];
}

async function request(
	fetchImpl: typeof fetch,
	url: string,
	init: RequestInit,
	timeoutMs: number
): Promise<Response | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetchImpl(url, { ...init, signal: controller.signal, cache: 'no-store' });
	} catch {
		return null; // offline, DNS failure, timeout…
	} finally {
		clearTimeout(timer);
	}
}

async function errorOutcome(res: Response): Promise<SyncOutcome> {
	let message: string | undefined;
	try {
		message = ((await res.json()) as { message?: string }).message;
	} catch {
		// not JSON
	}
	const status: SyncStatus =
		res.status === 401 ? 'unauthorized' : res.status === 503 ? 'disabled' : 'error';
	return { status, message: message ?? `Server responded ${res.status}`, accepted: 0, rejected: 0 };
}

const authHeaders = (settings: Settings) => ({
	authorization: `Bearer ${settings.accessCode}`,
	'content-type': 'application/json'
});

export async function runSync(options: Options = {}): Promise<SyncOutcome> {
	const fetchImpl = options.fetch ?? fetch;
	const timeoutMs = options.timeoutMs ?? 20_000;
	const batchSize = options.batchSize ?? 200;

	const settings = await getSettings();
	if (!settings?.accessCode) return { status: 'not_configured', accepted: 0, rejected: 0 };

	const box = await outbox();
	const items = [
		...box.shifts.map((s) => ({ kind: 'shift' as const, local: s })),
		...box.observations.map((o) => ({ kind: 'observation' as const, local: o })),
		...box.tombstones.map((t) => ({ kind: 'tombstone' as const, local: t }))
	];
	if (!items.length) return { status: 'nothing', accepted: 0, rejected: 0 };

	let accepted = 0;
	let rejected = 0;
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const shifts = batch.flatMap((b) => (b.kind === 'shift' ? [b.local.record] : []));
		const observations = batch.flatMap((b) => (b.kind === 'observation' ? [b.local.record] : []));
		const tombstones = batch.flatMap((b) => (b.kind === 'tombstone' ? [b.local] : []));
		const sentShifts = new Map(shifts.map((s) => [s.id, s.updated_at]));
		const sentObservations = new Map(observations.map((o) => [o.id, o.updated_at]));

		const res = await request(
			fetchImpl,
			'/api/sync',
			{
				method: 'POST',
				headers: authHeaders(settings),
				body: JSON.stringify({
					observer: { id: settings.observerId, name: settings.observerName || undefined },
					shifts,
					observations,
					deleted: {
						shifts: tombstones.filter((t) => t.kind === 'shift').map((t) => t.id),
						observations: tombstones.filter((t) => t.kind === 'observation').map((t) => t.id)
					}
				})
			},
			timeoutMs
		);
		if (!res) return { status: 'offline', accepted, rejected };
		if (!res.ok) return errorOutcome(res);

		const result = (await res.json()) as ServerResult;
		await markSynced('shifts', sentShifts, result.accepted.shifts);
		await markSynced('observations', sentObservations, result.accepted.observations);
		for (const r of result.rejected) {
			if (!r.id) continue;
			const store = r.kind === 'shift' ? 'shifts' : 'observations';
			const sent = (r.kind === 'shift' ? sentShifts : sentObservations).get(r.id);
			const message = r.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ');
			await markRejected(store, r.id, sent, message);
		}
		// Tombstones are done once the server has seen them, whether or not it had the record.
		await clearTombstones(tombstones.map((t) => t.id));
		accepted += result.accepted.shifts.length + result.accepted.observations.length;
		rejected += result.rejected.length;
	}

	await saveSettings({ lastSyncAt: Date.now() });
	return { status: 'ok', accepted, rejected };
}

export type ConfigStatus = 'ok' | 'offline' | 'unauthorized' | 'disabled' | 'error';

/**
 * Fetch program settings and the court/judge directory. Also how the setup screen checks an
 * access code before saving it.
 */
export async function fetchConfig(
	accessCode: string,
	options: Options = {}
): Promise<{ status: ConfigStatus; message?: string }> {
	const res = await request(
		options.fetch ?? fetch,
		'/api/config',
		{ headers: { authorization: `Bearer ${accessCode}` } },
		options.timeoutMs ?? 15_000
	);
	if (!res) return { status: 'offline' };
	if (!res.ok) {
		const outcome = await errorOutcome(res);
		return { status: outcome.status as ConfigStatus, message: outcome.message };
	}
	const body = (await res.json()) as {
		program: Settings['program'];
		directory: Settings['directory'];
	};
	await saveSettings({
		program: body.program,
		directory: body.directory,
		lastConfigAt: Date.now()
	});
	return { status: 'ok' };
}
