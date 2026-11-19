import { expect, type Page } from '@playwright/test';

export const ACCESS_CODE = 'e2e-code';

/** First-run setup on a fresh device. */
export async function setUpWatcher(page: Page, name = 'Test Watcher') {
	await page.goto('/');
	await page.waitForURL('**/setup');
	await page.getByLabel('Your name or initials').fill(name);
	await page.getByLabel('Program access code').fill(ACCESS_CODE);
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.waitForURL((url) => url.pathname === '/');
	await expect(page.getByTestId('start-shift')).toBeVisible();
}

export async function startShift(page: Page, court: string, courtroom: string, judge: string) {
	await page.getByTestId('start-shift').click();
	await page.waitForURL('**/shift/new');
	await page.getByLabel('Court', { exact: true }).fill(court);
	await page.getByLabel('Courtroom').fill(courtroom);
	await page.getByLabel('Judge on the bench').fill(judge);
	await page.getByRole('button', { name: 'Start shift' }).click();
	await page.waitForURL((url) => url.pathname === '/');
	await expect(page.getByTestId('new-hearing')).toBeVisible();
}

/** Tap a chip inside a labelled group (chip labels repeat across groups, e.g. "Other"). */
export async function chip(page: Page, group: string, option: string) {
	await page
		.getByRole('group', { name: group })
		.getByRole('button', { name: option, exact: true })
		.click();
}

/** Wait until the service worker controls the page, so it keeps working offline. */
export async function waitForServiceWorker(page: Page) {
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller) {
			await new Promise<void>((resolve) =>
				navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
					once: true
				})
			);
		}
	});
}
