#!/usr/bin/env node
/**
 * Apply database migrations. The server also does this on startup; this script is for running
 * migrations as a separate deploy step.
 *
 *   DATABASE_URL=postgres://… npm run db:migrate
 */
import { connect } from '../src/lib/server/db.ts';
import { migrate } from '../src/lib/server/migrations.ts';

const db = await connect(process.env.DATABASE_URL);
try {
	const applied = await migrate(db, (msg) => console.log(msg));
	console.log(
		applied.length ? `Applied ${applied.length} migration(s).` : 'Database is up to date.'
	);
} finally {
	await db.close();
}
