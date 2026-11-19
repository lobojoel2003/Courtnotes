/**
 * Storage for observations and shifts. Each table keeps the full standard-conformant record in a
 * `record` jsonb column plus a few extracted columns for filtering and indexing.
 */
import type { Queryable } from './db.ts';
import { validateObservation, validateShift, type ValidationIssue } from '../schema/validate.ts';
import type { Observation, Program, Shift } from '../schema/types.ts';

export const MAX_SYNC_RECORDS = 1000;

export interface SyncPayload {
	observer: { id: string; name?: string };
	shifts?: unknown[];
	observations?: unknown[];
	deleted?: { shifts?: string[]; observations?: string[] };
}

export interface SyncRejection {
	kind: 'shift' | 'observation';
	id: string | null;
	issues: ValidationIssue[];
}

export interface SyncResult {
	accepted: { shifts: string[]; observations: string[]; deleted: string[] };
	rejected: SyncRejection[];
	server_time: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Collapse runs of whitespace so "Hon.  A.   Marlowe " and "Hon. A. Marlowe" match. */
export function cleanText(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function idOf(value: unknown): string | null {
	const id = (value as { id?: unknown } | null)?.id;
	return typeof id === 'string' ? id : null;
}

/** Server-side normalisation applied before validation. The server owns the program block. */
function normalise<T extends Observation | Shift>(input: T, program: Program): T {
	const record = structuredClone(input);
	record.program = { ...program };
	if (record.court && typeof record.court === 'object') {
		for (const key of ['name', 'courtroom', 'county'] as const) {
			const v = record.court[key];
			if (typeof v === 'string') {
				const cleaned = cleanText(v);
				if (cleaned) record.court[key] = cleaned;
				else if (key !== 'name') delete record.court[key];
			}
		}
	}
	if (record.judge && typeof record.judge.name === 'string') {
		const name = cleanText(record.judge.name);
		if (name) record.judge = { name };
		else delete record.judge;
	}
	return record;
}

export interface ProgramContext extends Program {
	jurisdiction?: string;
}

export async function applySync(
	db: Queryable & { transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> },
	payload: SyncPayload,
	context: ProgramContext
): Promise<SyncResult> {
	const program: Program = context.name
		? { id: context.id, name: context.name }
		: { id: context.id };
	const programWithJurisdiction = { ...program, jurisdiction: context.jurisdiction };
	const observerId = payload.observer.id;
	const result: SyncResult = {
		accepted: { shifts: [], observations: [], deleted: [] },
		rejected: [],
		server_time: new Date().toISOString()
	};

	const reject = (kind: SyncRejection['kind'], value: unknown, issues: ValidationIssue[]) =>
		result.rejected.push({ kind, id: idOf(value), issues });

	await db.transaction(async (tx) => {
		for (const raw of payload.shifts ?? []) {
			if ((raw as Shift)?.observer?.id !== observerId) {
				reject('shift', raw, [{ path: '/observer/id', message: 'does not match the device' }]);
				continue;
			}
			const checked = validateShift(normalise(raw as Shift, program));
			if (!checked.ok) {
				reject('shift', raw, checked.issues);
				continue;
			}
			const shift = applyJurisdiction(checked.value, programWithJurisdiction);
			const ok = await upsertShift(tx, shift, payload.observer.name);
			if (ok) result.accepted.shifts.push(shift.id);
			else reject('shift', raw, [{ path: '/id', message: 'belongs to another observer' }]);
		}

		for (const raw of payload.observations ?? []) {
			if ((raw as Observation)?.observer?.id !== observerId) {
				reject('observation', raw, [
					{ path: '/observer/id', message: 'does not match the device' }
				]);
				continue;
			}
			const checked = validateObservation(normalise(raw as Observation, program));
			if (!checked.ok) {
				reject('observation', raw, checked.issues);
				continue;
			}
			const observation = applyJurisdiction(checked.value, programWithJurisdiction);
			const ok = await upsertObservation(tx, observation);
			if (ok) result.accepted.observations.push(observation.id);
			else reject('observation', raw, [{ path: '/id', message: 'belongs to another observer' }]);
		}

		const deletedObservations = (payload.deleted?.observations ?? []).filter((id) => UUID.test(id));
		const deletedShifts = (payload.deleted?.shifts ?? []).filter((id) => UUID.test(id));
		if (deletedObservations.length) {
			await tx.query(
				`update observations set deleted_at = coalesce(deleted_at, now())
				 where id = any($1::uuid[]) and observer_id = $2`,
				[deletedObservations, observerId]
			);
		}
		if (deletedShifts.length) {
			await tx.query(
				`update shifts set deleted_at = coalesce(deleted_at, now())
				 where id = any($1::uuid[]) and observer_id = $2`,
				[deletedShifts, observerId]
			);
		}
		result.accepted.deleted.push(...deletedObservations, ...deletedShifts);
	});

	return result;
}

function applyJurisdiction<T extends Observation | Shift>(
	record: T,
	program: { jurisdiction?: string }
): T {
	if (program.jurisdiction && !record.court.jurisdiction) {
		record.court.jurisdiction = program.jurisdiction;
	}
	return record;
}

/**
 * Last-writer-wins upsert. Returns false only when the id already belongs to another observer;
 * an older copy of a record we already have counts as accepted (the server copy is newer).
 */
async function upsertShift(tx: Queryable, shift: Shift, observerName?: string): Promise<boolean> {
	const { rows } = await tx.query<{ id: string }>(
		`insert into shifts (id, observer_id, observer_name, court_name, courtroom, judge_name,
			started_at, ended_at, record, updated_at)
		 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 on conflict (id) do update set
			observer_name = excluded.observer_name, court_name = excluded.court_name,
			courtroom = excluded.courtroom, judge_name = excluded.judge_name,
			started_at = excluded.started_at, ended_at = excluded.ended_at, record = excluded.record,
			updated_at = excluded.updated_at, received_at = now(), deleted_at = null
		 where shifts.observer_id = excluded.observer_id and shifts.updated_at <= excluded.updated_at
		 returning id`,
		[
			shift.id,
			shift.observer.id,
			observerName ? cleanText(observerName).slice(0, 200) : (shift.observer.name ?? null),
			shift.court.name,
			shift.court.courtroom ?? null,
			shift.judge?.name ?? null,
			shift.started_at,
			shift.ended_at ?? null,
			JSON.stringify(shift),
			shift.updated_at
		]
	);
	return rows.length > 0 || (await ownedBy(tx, 'shifts', shift.id, shift.observer.id));
}

async function upsertObservation(tx: Queryable, o: Observation): Promise<boolean> {
	const { rows } = await tx.query<{ id: string }>(
		`insert into observations (id, shift_id, observer_id, court_name, courtroom, judge_name,
			hearing_type, release_decision, bail_amount, started_at, record, updated_at)
		 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		 on conflict (id) do update set
			shift_id = excluded.shift_id, court_name = excluded.court_name,
			courtroom = excluded.courtroom, judge_name = excluded.judge_name,
			hearing_type = excluded.hearing_type, release_decision = excluded.release_decision,
			bail_amount = excluded.bail_amount, started_at = excluded.started_at,
			record = excluded.record, updated_at = excluded.updated_at, received_at = now(),
			deleted_at = null
		 where observations.observer_id = excluded.observer_id
			and observations.updated_at <= excluded.updated_at
		 returning id`,
		[
			o.id,
			o.shift_id ?? null,
			o.observer.id,
			o.court.name,
			o.court.courtroom ?? null,
			o.judge?.name ?? null,
			o.hearing_type,
			o.release_decision ?? null,
			o.bail?.amount ?? null,
			o.started_at,
			JSON.stringify(o),
			o.updated_at
		]
	);
	return rows.length > 0 || (await ownedBy(tx, 'observations', o.id, o.observer.id));
}

async function ownedBy(
	tx: Queryable,
	table: 'shifts' | 'observations',
	id: string,
	observerId: string
): Promise<boolean> {
	const { rows } = await tx.query<{ observer_id: string }>(
		`select observer_id::text from ${table} where id = $1`,
		[id]
	);
	return rows[0]?.observer_id === observerId;
}

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export interface Filters {
	/** Inclusive start date, YYYY-MM-DD in the program time zone. */
	from?: string;
	/** Inclusive end date, YYYY-MM-DD in the program time zone. */
	to?: string;
	court?: string;
	judge?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse filters from URL search params, dropping anything malformed. */
export function parseFilters(params: URLSearchParams): Filters {
	const filters: Filters = {};
	const from = params.get('from');
	const to = params.get('to');
	if (from && DATE.test(from)) filters.from = from;
	if (to && DATE.test(to)) filters.to = to;
	const court = params.get('court')?.trim();
	const judge = params.get('judge')?.trim();
	if (court) filters.court = court.slice(0, 200);
	if (judge) filters.judge = judge.slice(0, 200);
	return filters;
}

function where(filters: Filters, timeZone: string, alias = '') {
	const p = alias ? `${alias}.` : '';
	const clauses = [`${p}deleted_at is null`];
	const params: unknown[] = [];
	const add = (sql: string, value: unknown) => {
		params.push(value);
		clauses.push(sql.replaceAll('?', `$${params.length}`));
	};
	if (filters.from || filters.to) params.push(timeZone);
	const tz = `$${params.length}`;
	if (filters.from) add(`${p}started_at >= (?::date)::timestamp at time zone ${tz}`, filters.from);
	if (filters.to) add(`${p}started_at < (?::date + 1)::timestamp at time zone ${tz}`, filters.to);
	if (filters.court) add(`${p}court_name = ?`, filters.court);
	return { clauses, params, add };
}

export const MAX_QUERY_ROWS = 50_000;

export async function listObservations(
	db: Queryable,
	filters: Filters,
	timeZone: string,
	options: { includeExcluded?: boolean } = {}
): Promise<Observation[]> {
	const w = where(filters, timeZone);
	if (filters.judge) w.add(`judge_name = ?`, filters.judge);
	if (!options.includeExcluded) w.clauses.push('not excluded');
	const { rows } = await db.query<{ record: Observation }>(
		`select record from observations where ${w.clauses.join(' and ')}
		 order by started_at limit ${MAX_QUERY_ROWS}`,
		w.params
	);
	return rows.map((r) => r.record);
}

export interface ShiftRow {
	record: Shift;
	observer_name: string | null;
	hearings: number;
}

export async function listShifts(
	db: Queryable,
	filters: Filters,
	timeZone: string
): Promise<ShiftRow[]> {
	const w = where(filters, timeZone, 's');
	// A shift matches a judge filter if it started with that judge or logged a hearing before them.
	// (Every `?` in one clause refers to the same parameter.)
	if (filters.judge) {
		w.add(
			`(s.judge_name = ? or exists (select 1 from observations j where j.shift_id = s.id
				and j.judge_name = ? and j.deleted_at is null))`,
			filters.judge
		);
	}
	const { rows } = await db.query<ShiftRow>(
		`select s.record, s.observer_name,
			(select count(*)::int from observations o
			 where o.shift_id = s.id and o.deleted_at is null and not o.excluded) as hearings
		 from shifts s where ${w.clauses.join(' and ')}
		 order by s.started_at desc limit ${MAX_QUERY_ROWS}`,
		w.params
	);
	return rows;
}

export interface RecordRow {
	record: Observation;
	excluded: boolean;
	excluded_reason: string | null;
	received_at: string;
}

export async function pageObservations(
	db: Queryable,
	filters: Filters,
	timeZone: string,
	page: { limit: number; offset: number }
): Promise<{ rows: RecordRow[]; total: number }> {
	const w = where(filters, timeZone);
	if (filters.judge) w.add(`judge_name = ?`, filters.judge);
	const condition = w.clauses.join(' and ');
	const [{ rows }, { rows: count }] = await Promise.all([
		db.query<RecordRow>(
			`select record, excluded, excluded_reason, to_json(received_at) #>> '{}' as received_at
			 from observations where ${condition}
			 order by started_at desc limit ${Math.min(page.limit, 500)} offset ${Math.max(0, page.offset)}`,
			w.params
		),
		db.query<{ n: number }>(
			`select count(*)::int as n from observations where ${condition}`,
			w.params
		)
	]);
	return { rows, total: count[0].n };
}

export async function setExcluded(
	db: Queryable,
	id: string,
	excluded: boolean,
	reason?: string
): Promise<boolean> {
	if (!UUID.test(id)) return false;
	const { rows } = await db.query(
		`update observations set excluded = $2, excluded_reason = $3 where id = $1 returning id`,
		[id, excluded, excluded ? (reason?.trim().slice(0, 500) ?? null) : null]
	);
	return rows.length > 0;
}

export interface Directory {
	courts: { name: string; courtrooms: string[] }[];
	judges: string[];
}

/**
 * Names already in use, so watchers pick "Hon. A. Marlowe" from a list instead of typing
 * "Judge Marlowe" — consistent names are most of what data cleaning used to mean.
 */
export async function directory(db: Queryable): Promise<Directory> {
	const [courts, judges] = await Promise.all([
		db.query<{ name: string; courtrooms: string[] | null }>(
			`select court_name as name,
				array_remove(array_agg(distinct courtroom), null) as courtrooms
			 from shifts where deleted_at is null and started_at > now() - interval '1 year'
			 group by court_name order by count(*) desc limit 100`
		),
		db.query<{ name: string }>(
			`select judge_name as name from (
				select judge_name from observations where deleted_at is null and judge_name is not null
					and started_at > now() - interval '1 year'
				union all
				select judge_name from shifts where deleted_at is null and judge_name is not null
					and started_at > now() - interval '1 year'
			 ) j group by judge_name order by count(*) desc limit 300`
		)
	]);
	return {
		courts: courts.rows.map((c) => ({ name: c.name, courtrooms: (c.courtrooms ?? []).sort() })),
		judges: judges.rows.map((j) => j.name)
	};
}

export async function filterOptions(
	db: Queryable
): Promise<{ courts: string[]; judges: string[] }> {
	const [courts, judges] = await Promise.all([
		db.query<{ v: string }>(
			`select distinct court_name as v from observations where deleted_at is null order by 1 limit 500`
		),
		db.query<{ v: string }>(
			`select distinct judge_name as v from observations
			 where deleted_at is null and judge_name is not null order by 1 limit 1000`
		)
	]);
	return { courts: courts.rows.map((r) => r.v), judges: judges.rows.map((r) => r.v) };
}
