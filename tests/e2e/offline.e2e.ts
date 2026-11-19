import { expect, test } from '@playwright/test';
import { chip, setUpWatcher, startShift, waitForServiceWorker } from './helpers.ts';

test('works with no signal and syncs when it comes back', async ({ page, context }) => {
	await setUpWatcher(page, 'Basement Watcher');
	await waitForServiceWorker(page);

	// The courtroom is in the basement.
	await context.setOffline(true);
	await page.reload();
	await expect(page.getByTestId('start-shift')).toBeVisible();
	await expect(page.getByTestId('sync-badge')).toContainText('Offline');

	await startShift(page, 'Example County Justice Center', '1101', 'Hon. S. Whitcombe');
	await page.getByTestId('new-hearing').click();
	await chip(page, 'Hearing type', 'Arraignment');
	await chip(page, 'Defense lawyer', 'No lawyer');
	await chip(page, 'Release decision', 'Held, no bail');
	await page.getByTestId('save-done').click();
	await page.waitForURL((url) => url.pathname === '/');

	// A full reload offline still opens the app, with the hearing safe on the phone.
	await page.reload();
	await expect(page.getByText('1 hearing recorded')).toBeVisible();
	await expect(page.getByTestId('sync-badge')).toContainText('Offline · 2 saved');

	// Back upstairs: everything syncs on its own.
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect(page.getByTestId('sync-badge')).toContainText('Synced', { timeout: 20_000 });
});
