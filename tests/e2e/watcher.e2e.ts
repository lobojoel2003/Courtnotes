import { expect, test } from '@playwright/test';
import { chip, setUpWatcher, startShift } from './helpers.ts';

test('rejects a wrong access code during setup', async ({ page }) => {
	await page.goto('/setup');
	await page.getByLabel('Your name or initials').fill('Sam');
	await page.getByLabel('Program access code').fill('not-the-code');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('alert')).toContainText('not accepted');
	await expect(page).toHaveURL(/\/setup$/);
});

test('records a shift of hearings and syncs them', async ({ page }) => {
	await setUpWatcher(page, 'Sam R.');
	await startShift(page, 'Example County Justice Center', 'Arraignment Court B', 'Hon. A. Marlowe');

	await page.getByTestId('new-hearing').click();
	await expect(page.getByTestId('timer')).toBeVisible();
	await chip(page, 'Hearing type', 'Arraignment');
	await chip(page, 'Defense lawyer', 'Public defender');
	await chip(page, 'Release decision', 'Bail set');
	await page.getByTestId('bail-amount').fill('25000');
	await expect(page.getByTestId('bail-amount')).toHaveValue('25,000');
	await page.getByRole('button', { name: '+5,000' }).click();
	await expect(page.getByTestId('bail-amount')).toHaveValue('30,000');
	await chip(page, 'Bail type', '10% deposit');
	await chip(page, 'Outcome', 'Continued');
	await page.getByLabel('The judge said').fill('Thirty thousand, ten percent.');
	await page.getByTestId('save-next').click();

	// "Save & next case" leaves us on a fresh hearing with the timer already running.
	await expect(page.getByText('Saved. Timer running for the next case.')).toBeVisible();
	await expect(
		page.getByRole('group', { name: 'Hearing type' }).getByRole('button', { pressed: true })
	).toHaveCount(0);
	await chip(page, 'Hearing type', 'Bail review');
	await chip(page, 'Release decision', 'Released (ROR)');
	await page.getByTestId('save-done').click();

	await page.waitForURL((url) => url.pathname === '/');
	await expect(page.getByText('2 hearings recorded')).toBeVisible();
	await expect(page.getByRole('link', { name: /Bail \$30,000/ })).toBeVisible();
	await expect(page.getByTestId('sync-badge')).toContainText('Synced', { timeout: 15_000 });

	// Editing keeps the record and re-syncs it.
	await page.getByRole('link', { name: /Bail review/ }).click();
	await expect(page.getByText('Editing saved hearing')).toBeVisible();
	await chip(page, 'Outcome', 'Dismissed / withdrawn');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await page.waitForURL((url) => url.pathname === '/');
	await expect(page.getByRole('link', { name: /Bail review/ })).toBeVisible();

	await page.getByRole('button', { name: 'End shift' }).click();
	await page.getByRole('button', { name: 'Tap again to end the shift' }).click();
	await expect(page.getByTestId('start-shift')).toBeVisible();
	await expect(page.getByTestId('sync-badge')).toContainText('Synced', { timeout: 15_000 });
});

test('never loses a hearing in progress', async ({ page }) => {
	await setUpWatcher(page);
	await startShift(page, 'Northside Municipal Court', '3', 'Hon. R. Castellan');
	await page.getByTestId('new-hearing').click();
	await chip(page, 'Hearing type', 'Motion');
	await page.getByLabel('Notes').fill('Defense moved to suppress.');
	await page.waitForTimeout(600); // autosave debounce

	// Simulate the phone killing the tab.
	await page.reload();
	await page.goto('/');
	await expect(page.getByText('Hearing in progress')).toBeVisible();
	await page.getByText('Hearing in progress').click();
	await expect(
		page.getByRole('group', { name: 'Hearing type' }).getByRole('button', { name: 'Motion' })
	).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByLabel('Notes')).toHaveValue('Defense moved to suppress.');

	// Discard needs a second tap: no accidental loss.
	await page.getByRole('button', { name: 'Discard hearing' }).click();
	await page.getByRole('button', { name: 'Tap again to discard' }).click();
	await page.waitForURL((url) => url.pathname === '/');
	await expect(page.getByText('Hearing in progress')).toHaveCount(0);
});

test('shows the build version in settings', async ({ page }) => {
	await setUpWatcher(page);
	await page.goto('/settings');
	await expect(page.getByTestId('version')).toContainText(/^v\d+\.\d+\.\d+/);
});
