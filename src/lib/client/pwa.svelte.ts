/**
 * Service worker registration and the "new version ready" prompt. Updates never reload the
 * page by themselves: a volunteer mid-hearing decides when.
 */
class Pwa {
	updateReady = $state(false);
	#registration: ServiceWorkerRegistration | undefined;

	async register(): Promise<void> {
		if (!('serviceWorker' in navigator)) return;
		// Only a page that was already controlled by an older worker can have an "update". On the
		// very first visit the new worker claims the page, which must not look like an update.
		const hadController = Boolean(navigator.serviceWorker.controller);
		try {
			const reg = await navigator.serviceWorker.register('/service-worker.js');
			this.#registration = reg;
			const watch = (worker: ServiceWorker | null) => {
				worker?.addEventListener('statechange', () => {
					if (worker.state === 'installed' && hadController) this.updateReady = true;
				});
			};
			if (reg.waiting && hadController) this.updateReady = true;
			watch(reg.installing);
			reg.addEventListener('updatefound', () => watch(reg.installing));
			let reloading = false;
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				if (this.updateReady && !reloading) {
					reloading = true;
					location.reload();
				}
			});
			// Check for a new version every hour while the app stays open.
			setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000);
		} catch (err) {
			console.warn('[courtnotes] service worker registration failed', err);
		}
	}

	applyUpdate(): void {
		const waiting = this.#registration?.waiting;
		if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
		else location.reload();
	}
}

export const pwa = new Pwa();

/** Ask the browser not to evict our IndexedDB data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
	try {
		if (await navigator.storage?.persisted?.()) return true;
		return (await navigator.storage?.persist?.()) ?? false;
	} catch {
		return false;
	}
}
