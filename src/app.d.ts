// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Coordinator } from '#lib/server/auth.ts';

declare global {
	/** Injected by vite.config.ts */
	const __APP_VERSION__: string;
	const __BUILD_NUMBER__: string;
	const __COMMIT_SHA__: string;
	const __BUILD_DATE__: string;

	namespace App {
		interface Locals {
			coordinator: Coordinator | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
