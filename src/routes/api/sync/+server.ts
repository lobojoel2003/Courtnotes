import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, program } from '#lib/server/context.ts';
import { requireWatcher } from '#lib/server/watcher-auth.ts';
import { applySync, MAX_SYNC_RECORDS, type SyncPayload } from '#lib/server/records.ts';

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(message: string, status = 400) {
	return json({ error: 'bad_request', message }, { status });
}

/** Receives queued shifts, observations and deletions from a watcher's device. */
export const POST: RequestHandler = async (event) => {
	const denied = requireWatcher(event);
	if (denied) return denied;

	const length = Number(event.request.headers.get('content-length') ?? 0);
	if (length > MAX_BODY_BYTES) return bad('Request is too large; send fewer records at once.', 413);

	let payload: SyncPayload;
	try {
		payload = (await event.request.json()) as SyncPayload;
	} catch {
		return bad('Body must be JSON.');
	}
	if (!payload || typeof payload !== 'object') return bad('Body must be a JSON object.');
	if (typeof payload.observer?.id !== 'string' || !UUID.test(payload.observer.id)) {
		return bad('observer.id must be a UUID.');
	}
	if (payload.observer.name !== undefined && typeof payload.observer.name !== 'string') {
		return bad('observer.name must be a string.');
	}
	for (const key of ['shifts', 'observations'] as const) {
		if (payload[key] !== undefined && !Array.isArray(payload[key]))
			return bad(`${key} must be an array.`);
	}
	const deleted = payload.deleted ?? {};
	for (const key of ['shifts', 'observations'] as const) {
		const list = deleted[key];
		if (list !== undefined && (!Array.isArray(list) || list.some((id) => typeof id !== 'string'))) {
			return bad(`deleted.${key} must be an array of ids.`);
		}
	}
	const count =
		(payload.shifts?.length ?? 0) +
		(payload.observations?.length ?? 0) +
		(deleted.shifts?.length ?? 0) +
		(deleted.observations?.length ?? 0);
	if (count > MAX_SYNC_RECORDS) {
		return bad(`Send at most ${MAX_SYNC_RECORDS} records per request.`, 413);
	}

	const result = await applySync(await getDb(), payload, program);
	return json(result);
};
