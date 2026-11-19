import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;

/**
 * End-to-end tests run the production build (`npm run build` first) against a throwaway embedded
 * database, exactly as a volunteer's phone and a coordinator's laptop would use it.
 */
export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	use: {
		baseURL,
		trace: 'off',
		screenshot: 'only-on-failure',
		serviceWorkers: 'allow',
		launchOptions: {
			// Lets a machine with a preinstalled Chromium skip `playwright install`.
			executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined
		}
	},
	projects: [
		{ name: 'phone', use: { ...devices['Pixel 7'] }, testIgnore: '**/coordinator.e2e.ts' },
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] }, testMatch: '**/coordinator.e2e.ts' }
	],
	webServer: {
		command: 'node scripts/e2e-server.ts',
		url: `${baseURL}/api/health`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		env: {
			PORT: String(PORT),
			ORIGIN: baseURL,
			DATABASE_URL: 'pglite://.data/e2e',
			WATCHER_ACCESS_CODE: 'e2e-code',
			PROGRAM_ID: 'e2e-watch',
			PROGRAM_NAME: 'E2E Court Watch',
			PROGRAM_TIMEZONE: 'America/New_York',
			COORDINATOR_EMAIL: 'coordinator@example.org',
			COORDINATOR_PASSWORD: 'e2e-password-123',
			COORDINATOR_NAME: 'E2E Coordinator'
		}
	}
});
