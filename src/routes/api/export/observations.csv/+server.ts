import type { RequestHandler } from './$types';
import { getDb, program } from '#lib/server/context.ts';
import { listObservations, parseFilters } from '#lib/server/records.ts';
import { attachment, exportFilename, requireCoordinator } from '#lib/server/exports.ts';
import { OBSERVATION_COLUMNS, toCsv } from '#lib/csv.ts';

export const GET: RequestHandler = async (event) => {
	requireCoordinator(event);
	const filters = parseFilters(event.url.searchParams);
	const isPublic = event.url.searchParams.get('public') === '1';
	const records = await listObservations(await getDb(), filters, program.timeZone);
	return attachment(
		// Byte-order mark so Excel opens UTF-8 (accents in names, the en dash in labels) correctly.
		'﻿' + toCsv(records, OBSERVATION_COLUMNS, { public: isPublic }),
		exportFilename('observations', filters, 'csv', isPublic),
		'text/csv'
	);
};
