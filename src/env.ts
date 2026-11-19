import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);
const withDefault = (fallback: string) => (value: string | undefined) =>
	value?.trim() ? value.trim() : fallback;

/**
 * Runtime configuration. Every variable is read when the server starts, so one Docker image
 * can serve any program. See `.env.example` for documentation.
 */
export const variables = defineEnvVars({
	DATABASE_URL: {
		description:
			'Postgres connection string. When unset, an embedded PGlite database is stored in ./.data (fine for trying Courtnotes out; use Postgres in production).',
		schema: optional
	},
	WATCHER_ACCESS_CODE: {
		description:
			'Shared code volunteers enter on their phone to sync. Sync is disabled until this is set.',
		schema: optional
	},
	PROGRAM_ID: {
		description: 'URL-safe id stamped on every record, e.g. "philly-bail-watch".',
		schema: (value) => {
			const id = value?.trim() || 'court-watch';
			if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)) {
				throw new Error('PROGRAM_ID must be lowercase letters, digits and dashes');
			}
			return id;
		}
	},
	PROGRAM_NAME: {
		description: 'Display name of the court watch program.',
		schema: withDefault('Court Watch')
	},
	PROGRAM_JURISDICTION: {
		description: 'ISO 3166-2 code for the state or province, e.g. "US-PA".',
		schema: (value) => {
			const code = optional(value)?.toUpperCase();
			if (code && !/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(code)) {
				throw new Error('PROGRAM_JURISDICTION must be an ISO 3166-2 code such as US-PA');
			}
			return code;
		}
	},
	PROGRAM_TIMEZONE: {
		description: 'IANA time zone used to group hearings by day, e.g. "America/New_York".',
		schema: (value) => {
			const zone = value?.trim() || 'UTC';
			try {
				new Intl.DateTimeFormat('en-US', { timeZone: zone });
			} catch {
				throw new Error(`PROGRAM_TIMEZONE "${zone}" is not a valid IANA time zone`);
			}
			return zone;
		}
	},
	COORDINATOR_EMAIL: {
		description: 'Email of the first coordinator account, created on startup if none exist.',
		schema: optional
	},
	COORDINATOR_PASSWORD: {
		description: 'Password for the first coordinator account (at least 10 characters).',
		schema: optional
	},
	COORDINATOR_NAME: {
		description: 'Display name for the first coordinator account.',
		schema: withDefault('Coordinator')
	}
});
