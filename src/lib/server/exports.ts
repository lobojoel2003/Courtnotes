import { error, type RequestEvent } from '@sveltejs/kit';
import type { Filters } from './records.ts';

/** Throws 401 unless a coordinator is signed in. */
export function requireCoordinator(event: RequestEvent) {
	if (!event.locals.coordinator) error(401, 'Sign in as a coordinator to export data.');
	return event.locals.coordinator;
}

/** e.g. courtnotes-observations-2026-03-01_to_2026-03-31-public.csv */
export function exportFilename(kind: string, filters: Filters, ext: string, isPublic: boolean) {
	const range =
		filters.from || filters.to ? `-${filters.from ?? 'start'}_to_${filters.to ?? 'today'}` : '';
	return `courtnotes-${kind}${range}${isPublic ? '-public' : ''}.${ext}`;
}

export function attachment(body: string, filename: string, type: string): Response {
	return new Response(body, {
		headers: {
			'content-type': `${type}; charset=utf-8`,
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'no-store'
		}
	});
}
