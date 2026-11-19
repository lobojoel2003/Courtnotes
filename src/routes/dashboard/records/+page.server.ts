import { fail } from '@sveltejs/kit';
import { formText } from '#lib/url.ts';
import type { Actions, PageServerLoad } from './$types';
import { getDb, program } from '#lib/server/context.ts';
import { filterOptions, pageObservations, setExcluded } from '#lib/server/records.ts';
import { filterQuery, RANGES, resolveFilters } from '#lib/server/dashboard.ts';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url }) => {
	const { range, filters, description } = resolveFilters(url.searchParams, program.timeZone, 'all');
	const pageNumber = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const db = await getDb();
	const [{ rows, total }, options] = await Promise.all([
		pageObservations(db, filters, program.timeZone, {
			limit: PAGE_SIZE,
			offset: (pageNumber - 1) * PAGE_SIZE
		}),
		filterOptions(db)
	]);
	return {
		range,
		ranges: RANGES,
		filters,
		description,
		query: filterQuery(filters),
		options,
		rows,
		total,
		page: pageNumber,
		pages: Math.max(1, Math.ceil(total / PAGE_SIZE))
	};
};

export const actions: Actions = {
	exclude: async ({ request, locals }) => {
		if (!locals.coordinator) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const id = formText(form, 'id', 100);
		const exclude = form.get('exclude') === 'true';
		const reason = formText(form, 'reason', 500).trim() || `Excluded by ${locals.coordinator.name}`;
		const ok = await setExcluded(await getDb(), id, exclude, reason);
		if (!ok) return fail(404, { message: 'That record no longer exists.' });
		return { id, excluded: exclude };
	}
};
