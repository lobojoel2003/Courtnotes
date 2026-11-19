import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, program } from '#lib/server/context.ts';
import { requireWatcher } from '#lib/server/watcher-auth.ts';
import { directory } from '#lib/server/records.ts';
import { buildInfo } from '#lib/build-info.ts';

/**
 * Program settings and known court/judge names for a watcher's device. Also used by the setup
 * screen to check an access code.
 */
export const GET: RequestHandler = async (event) => {
	const denied = requireWatcher(event);
	if (denied) return denied;
	return json({
		program: { id: program.id, name: program.name, jurisdiction: program.jurisdiction ?? null },
		directory: await directory(await getDb()),
		server_version: buildInfo.version,
		server_time: new Date().toISOString()
	});
};
