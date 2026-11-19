import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { program, syncEnabled } from '#lib/server/context.ts';
import { versionLabel } from '#lib/build-info.ts';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.coordinator) {
		redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	}
	return {
		coordinator: locals.coordinator,
		program: { id: program.id, name: program.name, timeZone: program.timeZone },
		syncEnabled,
		version: versionLabel()
	};
};
