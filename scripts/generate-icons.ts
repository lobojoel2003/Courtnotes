#!/usr/bin/env node
/**
 * Render the PWA icons in static/icons from the logo, using the Playwright Chromium that the
 * test-suite already depends on. Run after changing the logo:  npm run icons
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const mark = (scale: number, rounded: boolean) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
	<rect width="64" height="64" ${rounded ? 'rx="15"' : ''} fill="#15171b"/>
	<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
		<path d="M12 25 32 12l20 13z" fill="#e8b04a"/>
		<rect x="14" y="31" width="36" height="4.5" rx="2.25" fill="#ece9e2"/>
		<rect x="14" y="40" width="28" height="4.5" rx="2.25" fill="#ece9e2" opacity=".75"/>
		<rect x="14" y="49" width="20" height="4.5" rx="2.25" fill="#ece9e2" opacity=".5"/>
	</g>
</svg>`;

const icons = [
	{ file: 'icon-32.png', size: 32, svg: mark(1, true) },
	{ file: 'icon-192.png', size: 192, svg: mark(1, true) },
	{ file: 'icon-512.png', size: 512, svg: mark(1, true) },
	// iOS rounds the corners itself; maskable icons keep the mark inside the 80% safe zone.
	{ file: 'apple-touch-icon.png', size: 180, svg: mark(0.92, false) },
	{ file: 'icon-maskable-512.png', size: 512, svg: mark(0.72, false) }
];

mkdirSync('static/icons', { recursive: true });
const browser = await chromium.launch({
	executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined
});
try {
	for (const icon of icons) {
		const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
		await page.setContent(
			`<html><body style="margin:0;background:transparent">${icon.svg}</body></html>`
		);
		await page.screenshot({ path: `static/icons/${icon.file}`, omitBackground: true });
		await page.close();
		console.log(`static/icons/${icon.file}`);
	}
} finally {
	await browser.close();
}
