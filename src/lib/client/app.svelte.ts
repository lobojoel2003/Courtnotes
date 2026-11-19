/**
 * Reactive state for the watcher app: device settings, sync status and screen wake lock.
 */
import { counts, getSettings, saveSettings, type Settings } from './store.ts';
import { fetchConfig, runSync } from './sync.ts';

const CONFIG_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 30_000;

type WakeLockSentinelLike = { release(): Promise<void>; released: boolean };

class WatcherApp {
	ready = $state(false);
	settings = $state<Settings | null>(null);
	online = $state(true);
	/** False when the browser claims to be online but the server can't be reached ("lie-fi"). */
	reachable = $state(true);
	syncing = $state(false);
	pending = $state(0);
	rejected = $state(0);
	problem = $state<string | null>(null);
	lastOutcome = $state<string | null>(null);

	#debounce: ReturnType<typeof setTimeout> | undefined;
	#wakeLock: WakeLockSentinelLike | null = null;

	get configured(): boolean {
		return Boolean(this.settings?.observerName && this.settings?.accessCode);
	}

	get programName(): string {
		return this.settings?.program?.name ?? 'Courtnotes';
	}

	async load(): Promise<void> {
		this.settings = (await getSettings()) ?? null;
		await this.refreshCounts();
		this.ready = true;
	}

	async refreshCounts(): Promise<void> {
		const c = await counts();
		this.pending = c.pending;
		this.rejected = c.rejected;
	}

	async updateSettings(update: Partial<Settings>): Promise<Settings> {
		this.settings = await saveSettings(update);
		if ('keepAwake' in update) void this.applyWakeLock();
		return this.settings;
	}

	/** Called after every save: sync soon, batching rapid edits together. */
	scheduleSync(delayMs = 1500): void {
		void this.refreshCounts();
		clearTimeout(this.#debounce);
		this.#debounce = setTimeout(() => void this.syncNow(), delayMs);
	}

	async syncNow(): Promise<void> {
		if (this.syncing || !this.configured) return;
		this.syncing = true;
		try {
			const outcome = await runSync();
			this.lastOutcome = outcome.status;
			switch (outcome.status) {
				case 'ok':
				case 'nothing':
					this.reachable = true;
					this.problem = null;
					break;
				case 'offline':
					this.reachable = false;
					break;
				case 'unauthorized':
					this.reachable = true;
					this.problem = 'The access code was not accepted. Check it in Settings.';
					break;
				default:
					this.reachable = true;
					this.problem = outcome.message ?? 'The server could not save your records.';
			}
			const s = await getSettings();
			if (
				s?.accessCode &&
				this.reachable &&
				outcome.status !== 'unauthorized' &&
				Date.now() - (s.lastConfigAt ?? 0) > CONFIG_MAX_AGE_MS
			) {
				await fetchConfig(s.accessCode);
			}
		} finally {
			this.settings = (await getSettings()) ?? null;
			await this.refreshCounts();
			this.syncing = false;
		}
	}

	async applyWakeLock(): Promise<void> {
		const nav = navigator as Navigator & {
			wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
		};
		if (!nav.wakeLock) return;
		if (this.settings?.keepAwake && document.visibilityState === 'visible') {
			if (!this.#wakeLock || this.#wakeLock.released) {
				this.#wakeLock = await nav.wakeLock.request('screen').catch(() => null);
			}
		} else if (this.#wakeLock) {
			await this.#wakeLock.release().catch(() => {});
			this.#wakeLock = null;
		}
	}

	/** Wire up connectivity listeners and periodic retries. Returns a cleanup function. */
	start(): () => void {
		this.online = navigator.onLine;
		const onOnline = () => {
			this.online = true;
			void this.syncNow();
		};
		const onOffline = () => (this.online = false);
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				void this.syncNow();
				void this.applyWakeLock();
			}
		};
		window.addEventListener('online', onOnline);
		window.addEventListener('offline', onOffline);
		document.addEventListener('visibilitychange', onVisible);
		const interval = setInterval(() => {
			if (this.pending > 0 && this.online) void this.syncNow();
		}, RETRY_MS);
		void this.syncNow();
		void this.applyWakeLock();
		return () => {
			window.removeEventListener('online', onOnline);
			window.removeEventListener('offline', onOffline);
			document.removeEventListener('visibilitychange', onVisible);
			clearInterval(interval);
		};
	}
}

export const app = new WatcherApp();
