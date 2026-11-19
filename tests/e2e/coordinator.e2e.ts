import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const EMAIL = 'coordinator@example.org';
const PASSWORD = 'e2e-password-123';

async function signIn(page: Page) {
	await page.goto('/dashboard');
	await page.waitForURL(/\/login/);
	await page.getByLabel('Email').fill(EMAIL);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL((url) => url.pathname === '/dashboard');
}

test('APIs refuse requests without credentials', async ({ request }) => {
	expect((await request.get('/api/health')).status()).toBe(200);
	expect(await (await request.get('/api/health')).json()).toMatchObject({
		status: 'ok',
		database: 'ok'
	});
	expect((await request.get('/api/export/observations.csv')).status()).toBe(401);
	expect((await request.get('/api/config')).status()).toBe(401);
	const sync = await request.post('/api/sync', {
		headers: { authorization: 'Bearer wrong' },
		data: { observer: { id: '00000000-0000-4000-8000-000000000000' } }
	});
	expect(sync.status()).toBe(401);
});

test('rejects a wrong password', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill(EMAIL);
	await page.getByLabel('Password').fill('wrong password!');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('alert')).toContainText('don’t match');
});

test('dashboard, records, exports and report', async ({ page, request }) => {
	// Put one hearing on the server through the same API the phones use.
	const observer = crypto.randomUUID();
	const now = new Date().toISOString();
	const sync = await request.post('/api/sync', {
		headers: { authorization: 'Bearer e2e-code' },
		data: {
			observer: { id: observer, name: 'API Watcher' },
			observations: [
				{
					schema_version: '1.0.0',
					id: crypto.randomUUID(),
					program: { id: 'e2e-watch' },
					observer: { id: observer },
					court: { name: 'Example County Justice Center', courtroom: 'B' },
					judge: { name: 'Hon. L. Brightwater' },
					hearing_type: 'arraignment',
					started_at: now,
					duration_seconds: 140,
					counsel: 'public_defender',
					release_decision: 'bail_set',
					bail: { amount: 7500 },
					notes: 'Private note',
					case_number: 'CR-1',
					updated_at: now
				}
			]
		}
	});
	expect(await sync.json()).toMatchObject({ rejected: [] });

	await signIn(page);
	await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Key figures' })).toContainText(
		'Hearings observed'
	);
	await expect(page.getByRole('row', { name: /Hon\. L\. Brightwater/ })).toBeVisible();
	await expect(page.locator('.chart svg').first()).toBeVisible();

	// Exports carry the data; the public one drops private fields.
	const csv = await (await page.request.get('/api/export/observations.csv?range=all')).text();
	expect(csv).toContain('hearing_type,counsel');
	expect(csv).toContain('Hon. L. Brightwater');
	expect(csv).toContain('CR-1');
	const pub = await (
		await page.request.get('/api/export/observations.csv?range=all&public=1')
	).text();
	expect(pub).not.toContain('CR-1');
	expect(pub).not.toContain('Private note');

	await page.getByText('Export').click();
	const download = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Full dataset (JSON, open standard)' }).click();
	const file = await (await download).path();
	const dataset = JSON.parse(await readFile(file, 'utf8')) as { observations: unknown[] };
	expect(dataset.observations.length).toBeGreaterThan(0);

	await page.getByRole('link', { name: 'Records' }).click();
	await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible();
	const row = page.getByRole('row', { name: /Hon\. L\. Brightwater/ }).first();
	await row.getByRole('button', { name: 'Exclude' }).click();
	await expect(row.getByRole('button', { name: 'Include' })).toBeVisible();
	await row.getByRole('button', { name: 'Include' }).click();
	await expect(row.getByRole('button', { name: 'Exclude' })).toBeVisible();

	await page.goto('/dashboard/report?range=all');
	await expect(page.getByRole('heading', { name: 'What we saw in court' })).toBeVisible();
	await expect(page.getByText('Key findings')).toBeVisible();

	await page.goto('/dashboard');
	await page.getByTitle('Sign out').click();
	await page.waitForURL(/\/login/);
	expect((await page.request.get('/api/export/observations.csv')).status()).toBe(401);
});
