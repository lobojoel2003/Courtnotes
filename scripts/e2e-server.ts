#!/usr/bin/env node
/** Start the production build on a fresh embedded database, for the Playwright suite. */
import { existsSync, rmSync } from 'node:fs';

const url = process.env.DATABASE_URL ?? '';
if (url.startsWith('pglite://') && url !== 'pglite://memory') {
	rmSync(url.slice('pglite://'.length), { recursive: true, force: true });
}
if (!existsSync('build/index.js')) {
	console.error('No production build found. Run `npm run build` first.');
	process.exit(1);
}
await import(new URL('../build/index.js', import.meta.url).href);
