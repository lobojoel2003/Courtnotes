import { json, type RequestEvent } from '@sveltejs/kit';
import { checkAccessCode, syncEnabled } from './context.ts';
import { accessCodeLimiter } from './rate-limit.ts';

/** Returns an error response if the request lacks a valid watcher access code, else null. */
export function requireWatcher(event: RequestEvent): Response | null {
	if (!syncEnabled) {
		return json(
			{
				error: 'sync_disabled',
				message: 'This server has no WATCHER_ACCESS_CODE configured, so syncing is turned off.'
			},
			{ status: 503 }
		);
	}
	const client = event.getClientAddress();
	const wait = accessCodeLimiter.retryAfter(client);
	if (wait) {
		return json(
			{ error: 'rate_limited', message: 'Too many wrong access codes. Try again later.' },
			{ status: 429, headers: { 'retry-after': String(wait) } }
		);
	}
	if (!checkAccessCode(event.request.headers.get('authorization'))) {
		accessCodeLimiter.hit(client);
		return json(
			{ error: 'unauthorized', message: 'The access code was not recognised.' },
			{ status: 401 }
		);
	}
	return null;
}
