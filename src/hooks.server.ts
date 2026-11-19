import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { getDb } from '#lib/server/context.ts';
import { getSessionCoordinator, SESSION_COOKIE } from '#lib/server/auth.ts';

export const init: ServerInit = async () => {
	// Connect and migrate on boot so configuration problems show up in the logs immediately.
	if (!building) await getDb();
};

const SECURITY_HEADERS: Record<string, string> = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'same-origin',
	'x-frame-options': 'DENY',
	'cross-origin-opener-policy': 'same-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
};

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.coordinator = null;
	const token = event.cookies.get(SESSION_COOKIE);
	if (token && !building) {
		event.locals.coordinator = await getSessionCoordinator(await getDb(), token);
		if (!event.locals.coordinator) event.cookies.delete(SESSION_COOKIE, { path: '/' });
	}

	const response = await resolve(event);
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!response.headers.has(name)) response.headers.set(name, value);
	}
	// Coordinator pages and API responses contain private data: never cache them anywhere.
	if (event.url.pathname.startsWith('/dashboard') || event.url.pathname.startsWith('/api/')) {
		response.headers.set('cache-control', 'no-store');
	}
	return response;
};

export const handleError: HandleServerError = ({ kind, error, event }) => {
	// Expected errors (404s, error() calls) keep SvelteKit's defaults; only log real failures.
	if (kind === 'unknown') {
		console.error(`[courtnotes] ${event.request.method} ${event.url.pathname}`, error);
	}
};
