#!/usr/bin/env node
/**
 * Regenerate the screenshots in docs/images from a running Courtnotes server with demo data:
 *
 *   npm run db:seed -- --reset
 *   npm run build && node build          # with WATCHER_ACCESS_CODE and a coordinator account
 *   BASE_URL=http://localhost:3000 ACCESS_CODE=… COORDINATOR_EMAIL=… COORDINATOR_PASSWORD=… \
 *     npm run screenshots
 *
 * Everything shown is synthetic: fictional judges, courts and volunteers.
 */
import { mkdirSync } from 'node:fs';
import { chromium, devices, type Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ACCESS_CODE = process.env.ACCESS_CODE ?? 'courtwatch';
const EMAIL = process.env.COORDINATOR_EMAIL ?? 'demo@example.org';
const PASSWORD = process.env.COORDINATOR_PASSWORD ?? 'demo-password-123';
const OUT = 'docs/images';

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
	executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined
});

/** Fill this phone's IndexedDB with a believable morning in arraignment court. */
async function stageMorning(page: Page) {
	await page.evaluate(async () => {
		const open = () =>
			new Promise<IDBDatabase>((resolve, reject) => {
				const req = indexedDB.open('courtnotes', 1);
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(new Error(String(req.error)));
			});
		const db = await open();
		const all = <T>(store: string) =>
			new Promise<T[]>((resolve) => {
				const req = db.transaction(store).objectStore(store).getAll();
				req.onsuccess = () => resolve(req.result as T[]);
			});
		type Rec = Record<string, unknown> & { record: Record<string, unknown> };
		const [shift] = await all<Rec>('shifts');
		const now = Date.now();
		const iso = (ms: number) => new Date(ms).toISOString();
		const shiftStart = now - 62 * 60_000;
		shift.record.started_at = iso(shiftStart);
		const settings = (await all<Record<string, unknown>>('settings'))[0];

		const hearings: [string, string, string, number | null, number][] = [
			['arraignment', 'public_defender', 'bail_set', 10000, 131],
			['arraignment', 'public_defender', 'released_conditions', null, 214],
			['bail_review', 'private', 'released_ror', null, 302],
			['arraignment', 'none', 'held_without_bail', null, 96],
			['arraignment', 'public_defender', 'bail_set', 50000, 158]
		];
		const tx = db.transaction(['shifts', 'observations', 'drafts', 'settings'], 'readwrite');
		let t = shiftStart + 9 * 60_000;
		hearings.forEach(([type, counsel, release, bail, seconds], i) => {
			const id = crypto.randomUUID();
			const record: Record<string, unknown> = {
				schema_version: '1.0.0',
				id,
				program: { id: 'example-court-watch' },
				observer: { id: settings.observerId },
				shift_id: shift.id,
				court: shift.record.court,
				judge: shift.record.judge,
				hearing_type: type,
				started_at: iso(t),
				ended_at: iso(t + seconds * 1000),
				duration_seconds: seconds,
				counsel,
				outcome: 'continued',
				release_decision: release,
				updated_at: iso(t + seconds * 1000)
			};
			if (bail) record.bail = { amount: bail, currency: 'USD', type: 'deposit' };
			tx.objectStore('observations').put({
				id,
				record,
				sync: i < 3 ? 'synced' : 'pending',
				savedAt: t
			});
			t += (seconds + 240 + i * 90) * 1000;
		});
		tx.objectStore('shifts').put({ ...shift, sync: 'synced' });
		const started = now - 161_000;
		tx.objectStore('drafts').put({
			id: crypto.randomUUID(),
			shiftId: shift.id,
			editing: false,
			form: {
				hearing_type: 'arraignment',
				counsel: 'public_defender',
				release_decision: 'bail_set',
				bail_amount: '25,000',
				bail_type: 'deposit',
				prosecution_request: '50,000',
				release_conditions: ['stay_away_order'],
				outcome: 'continued',
				case_number: '',
				judge: (shift.record.judge as { name: string }).name,
				judge_remarks: "I don't care that he has a job. Twenty-five thousand, ten percent.",
				notes: ''
			},
			timer: { firstStartedAt: started, runningSince: started, accumulatedMs: 0, stoppedAt: null },
			updatedAt: now
		});
		tx.objectStore('settings').put({ ...settings, lastSyncAt: now - 4 * 60_000 }, 'device');
		await new Promise((resolve) => (tx.oncomplete = resolve));
	});
}

// --- the phone ----------------------------------------------------------------------------------
{
	const context = await browser.newContext({ ...devices['Pixel 7'] });
	const page = await context.newPage();
	await page.goto(`${BASE}/setup`);
	await page.getByLabel('Your name or initials').fill('Ana R.');
	await page.getByLabel('Program access code').fill(ACCESS_CODE);
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.waitForURL((url) => url.pathname === '/');
	await page.evaluate(() => navigator.serviceWorker.ready);

	await page.getByTestId('start-shift').click();
	await page.getByLabel('Court', { exact: true }).fill('Example County Justice Center');
	await page.getByLabel('Courtroom').fill('Arraignment Court B');
	await page.getByLabel('Judge on the bench').fill('Hon. A. Marlowe');
	await page.screenshot({ path: `${OUT}/watcher-start-shift.png` });
	await page.getByRole('button', { name: 'Start shift' }).click();
	await page.waitForURL((url) => url.pathname === '/');

	await context.setOffline(true);
	await stageMorning(page);
	await page.reload();
	await page.getByText('Hearing in progress').waitFor();
	await page.waitForTimeout(400);
	await page.screenshot({ path: `${OUT}/watcher-shift.png` });

	await page.getByText('Hearing in progress').click();
	await page.getByTestId('timer').waitFor();
	await page.waitForTimeout(300);
	await page.screenshot({ path: `${OUT}/watcher-hearing.png` });
	await page.getByTestId('bail-amount').scrollIntoViewIfNeeded();
	await page.evaluate(() => window.scrollBy(0, -140));
	await page.waitForTimeout(200);
	await page.screenshot({ path: `${OUT}/watcher-bail.png` });
	await context.close();
}

// --- the coordinator ----------------------------------------------------------------------------
{
	const context = await browser.newContext({
		viewport: { width: 1360, height: 900 },
		deviceScaleFactor: 2,
		colorScheme: 'dark'
	});
	const page = await context.newPage();
	await page.goto(`${BASE}/login`);
	await page.getByLabel('Email').fill(EMAIL);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL((url) => url.pathname === '/dashboard');
	await page.waitForTimeout(2500);
	await page.mouse.move(0, 0);
	await page.screenshot({ path: `${OUT}/dashboard.png`, fullPage: true });
	await page.screenshot({ path: `${OUT}/dashboard-top.png` });

	await page.setViewportSize({ width: 1180, height: 900 });
	await page.goto(`${BASE}/dashboard/report`);
	await page.waitForTimeout(2500);
	await page.screenshot({
		path: `${OUT}/report.png`,
		clip: { x: 0, y: 0, width: 1180, height: 1500 }
	});
	await context.close();
}

// --- the hero image -------------------------------------------------------------------------------
{
	const { readFileSync } = await import('node:fs');
	const data = (file: string) =>
		`data:image/png;base64,${readFileSync(`${OUT}/${file}`).toString('base64')}`;
	const context = await browser.newContext({
		viewport: { width: 1600, height: 900 },
		deviceScaleFactor: 1
	});
	const page = await context.newPage();
	await page.setContent(`<!doctype html><html><body style="margin:0;width:1600px;height:900px;overflow:hidden;
		background:radial-gradient(circle at 70% 20%,#262217 0,#0c0d0f 60%);font-family:system-ui">
		<img src="${data('dashboard-top.png')}" style="position:absolute;left:520px;top:110px;width:1220px;
			border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6);border:1px solid #2c3038">
		<img src="${data('watcher-hearing.png')}" style="position:absolute;left:60px;top:70px;width:330px;
			border-radius:34px;border:8px solid #22252b;box-shadow:0 30px 80px rgba(0,0,0,.7)">
		<img src="${data('watcher-shift.png')}" style="position:absolute;left:300px;top:150px;width:330px;
			border-radius:34px;border:8px solid #22252b;box-shadow:0 30px 80px rgba(0,0,0,.7)">
	</body></html>`);
	await page.waitForTimeout(300);
	await page.screenshot({ path: `${OUT}/hero.png` });
	await context.close();
}

await browser.close();
console.log(`Screenshots written to ${OUT}/`);
