import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { execSync } from 'node:child_process';
import pkg from './package.json' with { type: 'json' };

function git(args: string): string {
	try {
		return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return '';
	}
}

// Build metadata. CI sets BUILD_NUMBER (the workflow run number) and COMMIT_SHA; local builds
// fall back to "dev" and the current git commit.
const version = pkg.version;
const buildNumber = process.env.BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER || 'dev';
const commit = (
	process.env.COMMIT_SHA ||
	process.env.GITHUB_SHA ||
	git('rev-parse HEAD') ||
	'unknown'
)
	.slice(0, 7)
	.toLowerCase();
const buildDate = process.env.SOURCE_DATE_EPOCH
	? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
	: new Date().toISOString();

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(version),
		__BUILD_NUMBER__: JSON.stringify(buildNumber),
		__COMMIT_SHA__: JSON.stringify(commit),
		__BUILD_DATE__: JSON.stringify(buildDate)
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ precompress: true }),
			// Deterministic per build so the service worker cache rolls over exactly once per release.
			version: { name: `${version}+${buildNumber}.${commit}` },
			// Registered by src/lib/client/pwa.svelte.ts, which also drives the update prompt.
			serviceWorker: { register: false },
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					// Svelte transitions and Observable Plot both write inline styles.
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					'connect-src': ['self'],
					'worker-src': ['self'],
					'manifest-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self']
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					testTimeout: 30_000,
					hookTimeout: 60_000
				}
			}
		]
	}
});
