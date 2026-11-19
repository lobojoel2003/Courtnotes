import type { PageServerLoad } from './$types';
import { getDb, program } from '#lib/server/context.ts';
import { filterOptions, listObservations, listShifts } from '#lib/server/records.ts';
import { filterQuery, RANGES, resolveFilters } from '#lib/server/dashboard.ts';
import { byDay, byJudge, countBy, summarize } from '#lib/stats.ts';
import type { Observation } from '#lib/schema/types.ts';

/** Only the fields the charts need, to keep the page payload small. */
function slim(o: Observation): Observation {
	return {
		id: o.id,
		hearing_type: o.hearing_type,
		started_at: o.started_at,
		ended_at: o.ended_at,
		duration_seconds: o.duration_seconds,
		judge: o.judge,
		release_decision: o.release_decision,
		bail: o.bail ? { amount: o.bail.amount } : undefined,
		counsel: o.counsel
	} as Observation;
}

export const load: PageServerLoad = async ({ url, depends }) => {
	depends('app:dashboard');
	const { range, filters, description } = resolveFilters(url.searchParams, program.timeZone);
	const db = await getDb();
	const [observations, shiftRows, options] = await Promise.all([
		listObservations(db, filters, program.timeZone),
		listShifts(db, filters, program.timeZone),
		filterOptions(db)
	]);
	const shifts = shiftRows.map((r) => r.record);
	const judges = byJudge(observations);

	return {
		range,
		ranges: RANGES,
		filters,
		description,
		query: filterQuery(filters),
		options,
		summary: summarize(observations, shifts, program.timeZone),
		judges,
		days: byDay(observations, shifts, program.timeZone),
		counsel: countBy(observations, 'counsel'),
		outcomes: countBy(observations, 'outcome'),
		observations: observations.map(slim),
		recentShifts: shiftRows.slice(0, 12).map((r) => ({
			id: r.record.id,
			started_at: r.record.started_at,
			ended_at: r.record.ended_at ?? null,
			court: r.record.court.name,
			courtroom: r.record.court.courtroom ?? null,
			judge: r.record.judge?.name ?? null,
			observer: r.observer_name ?? `Volunteer ${r.record.observer.id.slice(0, 4)}`,
			hearings: r.hearings
		})),
		generatedAt: new Date().toISOString()
	};
};
