import type { PageServerLoad } from './$types';
import { getDb, program } from '#lib/server/context.ts';
import { listObservations, listShifts } from '#lib/server/records.ts';
import { filterQuery, resolveFilters } from '#lib/server/dashboard.ts';
import { byDay, byJudge, countBy, findings, summarize } from '#lib/stats.ts';
import type { Observation } from '#lib/schema/types.ts';

export const load: PageServerLoad = async ({ url }) => {
	const { filters, description } = resolveFilters(url.searchParams, program.timeZone);
	const db = await getDb();
	const [observations, shiftRows] = await Promise.all([
		listObservations(db, filters, program.timeZone),
		listShifts(db, filters, program.timeZone)
	]);
	const shifts = shiftRows.map((r) => r.record);
	const summary = summarize(observations, shifts, program.timeZone);
	const judges = byJudge(observations);
	return {
		filters,
		description,
		query: filterQuery(filters),
		summary,
		judges,
		days: byDay(observations, shifts, program.timeZone),
		counsel: countBy(observations, 'counsel'),
		findings: findings(summary, judges),
		observations: observations.map(
			(o) =>
				({
					id: o.id,
					hearing_type: o.hearing_type,
					started_at: o.started_at,
					duration_seconds: o.duration_seconds,
					ended_at: o.ended_at,
					judge: o.judge,
					release_decision: o.release_decision,
					bail: o.bail ? { amount: o.bail.amount } : undefined
				}) as Observation
		),
		generatedAt: new Date().toISOString()
	};
};
