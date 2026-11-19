import type { RequestHandler } from './$types';
import { getDb, program } from '#lib/server/context.ts';
import { listShifts, parseFilters } from '#lib/server/records.ts';
import { attachment, exportFilename, requireCoordinator } from '#lib/server/exports.ts';
import { SHIFT_COLUMNS, toCsv } from '#lib/csv.ts';

export const GET: RequestHandler = async (event) => {
	requireCoordinator(event);
	const filters = parseFilters(event.url.searchParams);
	const isPublic = event.url.searchParams.get('public') === '1';
	const rows = await listShifts(await getDb(), filters, program.timeZone);
	const shifts = rows.map((r) => ({
		...r.record,
		observer: { ...r.record.observer, name: r.observer_name ?? r.record.observer.name },
		hearings: r.hearings
	}));
	return attachment(
		'﻿' + toCsv(shifts, SHIFT_COLUMNS, { public: isPublic }),
		exportFilename('shifts', filters, 'csv', isPublic),
		'text/csv'
	);
};
