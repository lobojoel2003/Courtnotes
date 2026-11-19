/**
 * Flat CSV export of standard records. Column names are stable across releases (new columns are
 * only ever appended) so spreadsheets and scripts built on an export keep working.
 */
import type { Observation, Shift } from './schema/types.ts';

export interface ExportOptions {
	/**
	 * Public datasets drop fields that could identify a defendant or a volunteer:
	 * observer names, case numbers and free-text notes.
	 */
	public?: boolean;
}

type Column<T> = [header: string, value: (r: T) => unknown, privateOnly?: boolean];

export const OBSERVATION_COLUMNS: Column<Observation>[] = [
	['id', (r) => r.id],
	['started_at', (r) => r.started_at],
	['ended_at', (r) => r.ended_at],
	['duration_seconds', (r) => r.duration_seconds],
	['court', (r) => r.court.name],
	['courtroom', (r) => r.court.courtroom],
	['jurisdiction', (r) => r.court.jurisdiction],
	['county', (r) => r.court.county],
	['judge', (r) => r.judge?.name],
	['hearing_type', (r) => r.hearing_type],
	['counsel', (r) => r.counsel],
	['outcome', (r) => r.outcome],
	['release_decision', (r) => r.release_decision],
	['bail_amount', (r) => r.bail?.amount],
	['bail_currency', (r) => (r.bail ? (r.bail.currency ?? 'USD') : undefined)],
	['bail_type', (r) => r.bail?.type],
	['bail_prosecution_request', (r) => r.bail?.prosecution_request],
	['release_conditions', (r) => r.release_conditions?.join(';')],
	['defendant_appearance', (r) => r.defendant?.appearance],
	['defendant_in_custody', (r) => r.defendant?.in_custody],
	['defendant_interpreter', (r) => r.defendant?.interpreter],
	['perceived_gender', (r) => r.defendant?.perceived_gender],
	['perceived_race_ethnicity', (r) => r.defendant?.perceived_race_ethnicity],
	['perceived_age_range', (r) => r.defendant?.perceived_age_range],
	['judge_remarks', (r) => r.judge_remarks],
	['case_number', (r) => r.case_number, true],
	['notes', (r) => r.notes, true],
	['observer_id', (r) => r.observer.id],
	['observer_name', (r) => r.observer.name, true],
	['shift_id', (r) => r.shift_id],
	['program_id', (r) => r.program.id],
	['schema_version', (r) => r.schema_version],
	['updated_at', (r) => r.updated_at]
];

export const SHIFT_COLUMNS: Column<Shift & { hearings?: number }>[] = [
	['id', (r) => r.id],
	['started_at', (r) => r.started_at],
	['ended_at', (r) => r.ended_at],
	['court', (r) => r.court.name],
	['courtroom', (r) => r.court.courtroom],
	['jurisdiction', (r) => r.court.jurisdiction],
	['judge', (r) => r.judge?.name],
	['hearings', (r) => r.hearings],
	['notes', (r) => r.notes, true],
	['observer_id', (r) => r.observer.id],
	['observer_name', (r) => r.observer.name, true],
	['program_id', (r) => r.program.id],
	['schema_version', (r) => r.schema_version],
	['updated_at', (r) => r.updated_at]
];

/**
 * RFC 4180 escaping, plus protection against spreadsheet formula injection: a text cell that
 * starts with = + - @ or a control character is prefixed with an apostrophe.
 */
export function csvCell(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	let text = typeof value === 'string' ? value : JSON.stringify(value);
	if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv<T>(rows: T[], columns: Column<T>[], options: ExportOptions = {}): string {
	const cols = columns.filter(([, , privateOnly]) => !(options.public && privateOnly));
	const lines = [cols.map(([header]) => header).join(',')];
	for (const row of rows) lines.push(cols.map(([, get]) => csvCell(get(row))).join(','));
	// CRLF per RFC 4180; Excel and Google Sheets both expect it.
	return lines.join('\r\n') + '\r\n';
}

/** Strip private fields from a record for public datasets. */
export function publicObservation(o: Observation): Observation {
	const copy = structuredClone(o);
	delete copy.case_number;
	delete copy.notes;
	delete copy.observer.name;
	return copy;
}

export function publicShift(s: Shift): Shift {
	const copy = structuredClone(s);
	delete copy.notes;
	delete copy.observer.name;
	return copy;
}
