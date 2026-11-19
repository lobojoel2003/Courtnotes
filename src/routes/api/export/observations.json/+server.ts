import type { RequestHandler } from './$types';
import { getDb, program } from '#lib/server/context.ts';
import { listObservations, listShifts, parseFilters } from '#lib/server/records.ts';
import { attachment, exportFilename, requireCoordinator } from '#lib/server/exports.ts';
import { publicObservation, publicShift } from '#lib/csv.ts';
import { SCHEMA_VERSION } from '#lib/schema/types.ts';
import observationSchema from '../../../../../schema/v1/court-observation.schema.json' with { type: 'json' };
import shiftSchema from '../../../../../schema/v1/court-watch-shift.schema.json' with { type: 'json' };

/**
 * Standard-conformant dataset: every element of `observations` validates against
 * court-observation.schema.json and every element of `shifts` against court-watch-shift.schema.json.
 */
export const GET: RequestHandler = async (event) => {
	requireCoordinator(event);
	const filters = parseFilters(event.url.searchParams);
	const isPublic = event.url.searchParams.get('public') === '1';
	const db = await getDb();
	const [observations, shiftRows] = await Promise.all([
		listObservations(db, filters, program.timeZone),
		listShifts(db, filters, program.timeZone)
	]);
	const shifts = shiftRows.map((r) => r.record);
	const dataset = {
		courtnotes_dataset: SCHEMA_VERSION,
		generated_at: new Date().toISOString(),
		program: { id: program.id, name: program.name },
		filters,
		public: isPublic,
		license_note:
			'The Courtnotes schema is CC0. The program that collected this data chooses its license.',
		schemas: { observation: observationSchema.$id, shift: shiftSchema.$id },
		shifts: isPublic ? shifts.map(publicShift) : shifts,
		observations: isPublic ? observations.map(publicObservation) : observations
	};
	return attachment(
		JSON.stringify(dataset, null, 2) + '\n',
		exportFilename('dataset', filters, 'json', isPublic),
		'application/json'
	);
};
