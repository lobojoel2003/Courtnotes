import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/context.ts';
import { buildInfo } from '#lib/build-info.ts';

/** Liveness and readiness probe for Docker, load balancers and uptime monitors. */
export const GET: RequestHandler = async () => {
	let database: 'ok' | 'unavailable' = 'ok';
	try {
		const db = await getDb();
		await db.query('select 1');
	} catch (err) {
		console.error('[courtnotes] health check failed', err);
		database = 'unavailable';
	}
	return json(
		{
			status: database === 'ok' ? 'ok' : 'degraded',
			version: buildInfo.version,
			build: buildInfo.build,
			commit: buildInfo.commit,
			built_at: buildInfo.date,
			database
		},
		{ status: database === 'ok' ? 200 : 503 }
	);
};
