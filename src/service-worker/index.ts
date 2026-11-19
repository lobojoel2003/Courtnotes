/**
 * Courtnotes service worker: makes the watcher app open and work with no network at all.
 *
 * - The app shell (prerendered watcher pages, JS, CSS, icons) is precached at install and served
 *   cache-first: it is versioned with each release, so it never goes stale silently.
 * - API calls and coordinator pages always go to the network; private data is never cached.
 * - A new version waits until the volunteer taps "Reload", so an update can't interrupt a hearing.
 */
import { self } from '$app/service-worker';
import { assets, immutable, prerendered } from '$app/manifest';
import { version } from '$app/env';

const CACHE = `courtnotes-${version}`;
const NETWORK_ONLY = ['/api/', '/dashboard', '/login', '/logout'];

const pathOf = (path: string) => new URL(path, self.registration.scope).pathname;
const PRECACHE = [...new Set([...immutable, ...assets, ...prerendered].map((f) => pathOf(f.path)))];

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE && key.startsWith('courtnotes-')) await caches.delete(key);
			}
			// Take control of pages opened before the first install, so they work offline right away.
			await self.clients.claim();
		})()
	);
});

self.addEventListener('message', (event) => {
	if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

async function respond(request: Request, url: URL): Promise<Response> {
	const cache = await caches.open(CACHE);
	// Query strings (e.g. /hearing?id=…) don't change the shell; match on the path.
	const cached = await cache.match(url.pathname);
	if (cached) return cached;

	try {
		return await fetch(request);
	} catch (err) {
		if (request.mode === 'navigate') {
			const shell = await cache.match('/');
			if (shell) return shell;
		}
		throw err;
	}
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (NETWORK_ONLY.some((prefix) => url.pathname.startsWith(prefix))) return;
	event.respondWith(respond(request, url));
});
