#!/usr/bin/env node
/**
 * Fill the database with realistic, entirely synthetic court watch data for demos, screenshots
 * and development. Every record goes through the same validation as real sync traffic.
 *
 *   npm run db:seed                 # 6 weeks of weekday shifts
 *   npm run db:seed -- --days 90 --reset
 *
 * The judges, courts and volunteers are fictional. The generator is seeded, so the same options
 * always produce the same data.
 */
import { parseArgs } from 'node:util';
import { connect } from '../src/lib/server/db.ts';
import { migrate } from '../src/lib/server/migrations.ts';
import { applySync } from '../src/lib/server/records.ts';
import {
	SCHEMA_VERSION,
	type Counsel,
	type HearingType,
	type Observation,
	type Outcome,
	type ReleaseCondition,
	type ReleaseDecision,
	type Shift
} from '../src/lib/schema/types.ts';

const { values } = parseArgs({
	options: {
		days: { type: 'string', default: '42' },
		seed: { type: 'string', default: '20260302' },
		reset: { type: 'boolean', default: false }
	}
});

const DAYS = Math.max(1, Math.min(365, Number(values.days) || 42));
const TIME_ZONE = process.env.PROGRAM_TIMEZONE || 'America/New_York';
const PROGRAM = {
	id: process.env.PROGRAM_ID || 'court-watch',
	name: process.env.PROGRAM_NAME || 'Court Watch',
	jurisdiction: process.env.PROGRAM_JURISDICTION || 'US-PA'
};

// --- deterministic randomness ---------------------------------------------------------------
let state = Number(values.seed) >>> 0;
function random(): number {
	state = (state + 0x6d2b79f5) >>> 0;
	let t = state;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const chance = (p: number) => random() < p;
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
function pick<T>(weights: [T, number][]): T {
	const total = weights.reduce((s, [, w]) => s + w, 0);
	let r = random() * total;
	for (const [value, w] of weights) if ((r -= w) <= 0) return value;
	return weights[weights.length - 1][0];
}
function normal(): number {
	return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}
function uuid(): string {
	const hex = Array.from({ length: 32 }, () => int(0, 15).toString(16));
	hex[12] = '4';
	hex[16] = ((int(0, 15) & 0x3) | 0x8).toString(16);
	const h = hex.join('');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// --- time helpers ---------------------------------------------------------------------------
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	}).formatToParts(instant);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
	return Math.round((asUtc - instant.getTime()) / 60000);
}
/** The UTC instant of a wall-clock time on a date in a time zone. */
function zoned(date: string, hour: number, minute: number): Date {
	const guess = new Date(
		`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`
	);
	return new Date(guess.getTime() - zoneOffsetMinutes(guess, TIME_ZONE) * 60000);
}
const iso = (d: Date) => d.toISOString().replace('.000Z', 'Z');
const addSeconds = (d: Date, s: number) => new Date(d.getTime() + s * 1000);

// --- the fictional courthouse ---------------------------------------------------------------
interface JudgeProfile {
	name: string;
	/** Weights for release decisions at arraignments and bail reviews. */
	release: [ReleaseDecision, number][];
	/** Median bail when bail is set. */
	medianBail: number;
	/** Minutes a typical arraignment takes before this judge. */
	pace: number;
}

const JUDGES: JudgeProfile[] = [
	{
		name: 'Hon. A. Marlowe',
		release: [
			['bail_set', 58],
			['released_ror', 14],
			['released_conditions', 16],
			['held_without_bail', 12]
		],
		medianBail: 25000,
		pace: 2.1
	},
	{
		name: 'Hon. R. Castellan',
		release: [
			['bail_set', 33],
			['released_ror', 30],
			['released_conditions', 30],
			['held_without_bail', 7]
		],
		medianBail: 5000,
		pace: 3.4
	},
	{
		name: 'Hon. D. Okonjo-Reyes',
		release: [
			['bail_set', 14],
			['released_ror', 48],
			['released_conditions', 34],
			['held_without_bail', 4]
		],
		medianBail: 2500,
		pace: 4.6
	},
	{
		name: 'Hon. S. Whitcombe',
		release: [
			['bail_set', 66],
			['released_ror', 8],
			['released_conditions', 12],
			['held_without_bail', 14]
		],
		medianBail: 50000,
		pace: 1.6
	},
	{
		name: 'Hon. L. Brightwater',
		release: [
			['bail_set', 30],
			['released_ror', 26],
			['released_conditions', 38],
			['held_without_bail', 6]
		],
		medianBail: 10000,
		pace: 3.0
	}
];

const COURTS = [
	{
		name: 'Example County Justice Center',
		rooms: ['Arraignment Court A', 'Arraignment Court B'],
		arraignment: true
	},
	{ name: 'Example County Justice Center', rooms: ['1101', '1104'], arraignment: false },
	{ name: 'Northside Municipal Court', rooms: ['3', '5'], arraignment: true }
];

const WATCHERS = ['Ana R.', 'Ben T.', 'Chloé M.', 'Dev P.', 'Eli K.', 'Fatima S.', 'Grace O.'].map(
	(name) => ({ id: uuid(), name })
);

const REMARKS = [
	"I've read the affidavit. Bail is set as requested.",
	'Your client should have thought about his job before he got arrested.',
	'Can he pay it? That is not my concern today.',
	"I'm going to give you a chance. Don't make me regret it.",
	'Next case. Let’s keep it moving, counsel.',
	'Ma’am, I can’t hear you over the video. We’ll do it without her.',
	'The Commonwealth has not met its burden. She is released.',
	'Ten percent applies. That’s the best I can do.'
];
const NOTES = [
	'Defense asked for ROR citing steady job and kids at home; no ability-to-pay inquiry.',
	'Video feed from the jail froze; hearing continued without defendant able to hear.',
	'Public defender met the client for the first time at the podium.',
	'Prosecutor asked for double the amount the judge set.',
	'Interpreter arrived after the hearing ended.',
	'Family in the gallery; judge did not acknowledge them.',
	'Judge reviewed the risk assessment out loud.'
];

const ROUND = [
	250, 500, 1000, 1500, 2500, 5000, 7500, 10000, 15000, 20000, 25000, 35000, 50000, 75000, 100000,
	150000, 250000
];
const roundBail = (n: number) =>
	ROUND.reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best));

function hearingType(arraignment: boolean): HearingType {
	return arraignment
		? pick<HearingType>([
				['arraignment', 78],
				['bail_review', 18],
				['probation_violation', 4]
			])
		: pick<HearingType>([
				['status_conference', 30],
				['preliminary_hearing', 22],
				['motion', 12],
				['plea', 14],
				['sentencing', 10],
				['bail_review', 6],
				['probation_violation', 4],
				['trial', 2]
			]);
}

function outcome(type: HearingType): Outcome {
	switch (type) {
		case 'arraignment':
		case 'bail_review':
			return pick<Outcome>([
				['continued', 88],
				['dismissed', 4],
				['diversion', 4],
				['warrant_issued', 4]
			]);
		case 'preliminary_hearing':
			return pick<Outcome>([
				['held_for_trial', 52],
				['continued', 30],
				['dismissed', 14],
				['diversion', 4]
			]);
		case 'plea':
			return pick<Outcome>([
				['plea_entered', 80],
				['continued', 20]
			]);
		case 'sentencing':
			return pick<Outcome>([
				['sentenced', 85],
				['continued', 15]
			]);
		case 'status_conference':
			return pick<Outcome>([
				['continued', 80],
				['warrant_issued', 10],
				['dismissed', 6],
				['other', 4]
			]);
		default:
			return pick<Outcome>([
				['continued', 65],
				['dismissed', 15],
				['other', 20]
			]);
	}
}

function counsel(): Counsel {
	return pick<Counsel>([
		['public_defender', 60],
		['private', 15],
		['court_appointed', 9],
		['none', 10],
		['waived', 2],
		['unknown', 4]
	]);
}

function makeHearing(
	shift: Shift,
	judge: JudgeProfile,
	arraignment: boolean,
	start: Date
): Observation {
	const type = hearingType(arraignment);
	const minutes =
		type === 'arraignment' || type === 'bail_review'
			? judge.pace * Math.exp(0.45 * normal())
			: (type === 'trial' ? 40 : 6) * Math.exp(0.6 * normal());
	const duration = Math.max(25, Math.round(minutes * 60));
	const end = addSeconds(start, duration);

	const decides =
		type === 'arraignment' || type === 'bail_review' || type === 'probation_violation';
	const release: ReleaseDecision = decides
		? pick(judge.release)
		: chance(0.04)
			? 'remains_in_custody'
			: 'not_addressed';

	const o: Observation = {
		schema_version: SCHEMA_VERSION,
		id: uuid(),
		program: { id: PROGRAM.id },
		observer: shift.observer,
		shift_id: shift.id,
		court: { ...shift.court },
		judge: { name: judge.name },
		hearing_type: type,
		started_at: iso(start),
		ended_at: iso(end),
		duration_seconds: duration,
		counsel: counsel(),
		outcome: outcome(type),
		release_decision: release,
		recorded_at: iso(start),
		updated_at: iso(addSeconds(end, int(5, 90)))
	};

	if (release === 'bail_set') {
		const amount = roundBail(judge.medianBail * Math.exp(0.9 * normal()));
		o.bail = {
			amount,
			currency: 'USD',
			type: pick([
				['deposit', 55],
				['cash', 25],
				['secured', 15],
				['unsecured', 5]
			])
		};
		if (chance(0.45)) o.bail.prosecution_request = roundBail(amount * (1 + random() * 2));
	}
	if (release === 'released_conditions' || (release === 'bail_set' && chance(0.3))) {
		const pool: ReleaseCondition[] = [
			'pretrial_supervision',
			'stay_away_order',
			'drug_testing',
			'electronic_monitoring',
			'curfew',
			'treatment'
		];
		o.release_conditions = [
			...new Set(Array.from({ length: int(1, 2) }, () => pool[int(0, pool.length - 1)]))
		];
	}
	if (arraignment || chance(0.5)) {
		o.defendant = {
			appearance: arraignment
				? pick([
						['video', 45],
						['in_person', 50],
						['not_present', 5]
					])
				: pick([
						['in_person', 85],
						['video', 10],
						['not_present', 5]
					]),
			in_custody: arraignment ? chance(0.7) : chance(0.25)
		};
		if (chance(0.12)) o.defendant.interpreter = chance(0.75) ? 'provided' : 'needed_not_provided';
		if (chance(0.7)) {
			o.defendant.perceived_gender = pick([
				['man', 78],
				['woman', 19],
				['unsure', 3]
			]);
			o.defendant.perceived_race_ethnicity = pick([
				['black', 46],
				['white', 26],
				['latino', 19],
				['asian', 4],
				['another', 2],
				['unsure', 3]
			]);
			o.defendant.perceived_age_range = pick([
				['18_24', 24],
				['25_34', 36],
				['35_44', 21],
				['45_54', 11],
				['55_64', 6],
				['unsure', 2]
			]);
		}
	}
	if (chance(0.08)) o.judge_remarks = REMARKS[int(0, REMARKS.length - 1)];
	if (chance(0.1)) o.notes = NOTES[int(0, NOTES.length - 1)];
	return o;
}

// --- generate -------------------------------------------------------------------------------
const today = new Date();
const batches = new Map<string, { name: string; shifts: Shift[]; observations: Observation[] }>();
for (const w of WATCHERS) batches.set(w.id, { name: w.name, shifts: [], observations: [] });

for (let back = DAYS; back >= 1; back--) {
	const day = new Date(today.getTime() - back * 86400000);
	const date = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(day);
	const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
	if (weekday === 0 || weekday === 6) continue;
	// Coverage varies: some days only one volunteer shows up.
	const shiftsToday = pick([
		[1, 25],
		[2, 45],
		[3, 30]
	]);
	const used = new Set<number>();
	for (let s = 0; s < shiftsToday; s++) {
		let ci: number;
		do ci = int(0, COURTS.length - 1);
		while (used.has(ci) && used.size < COURTS.length);
		used.add(ci);
		const court = COURTS[ci];
		const watcher = WATCHERS[int(0, WATCHERS.length - 1)];
		const judge = JUDGES[(ci * 2 + weekday + (back % 3)) % JUDGES.length];
		const startHour = chance(0.65) ? 9 : 13;
		const start = zoned(date, startHour, int(0, 20));
		const shift: Shift = {
			schema_version: SCHEMA_VERSION,
			id: uuid(),
			program: { id: PROGRAM.id },
			observer: { id: watcher.id },
			court: { name: court.name, courtroom: court.rooms[int(0, court.rooms.length - 1)] },
			judge: { name: judge.name },
			started_at: iso(start),
			updated_at: iso(start)
		};
		let clock = addSeconds(start, int(10, 45) * 60); // courts rarely start on time
		const hearings = int(court.arraignment ? 12 : 6, court.arraignment ? 26 : 14);
		const batch = batches.get(watcher.id)!;
		for (let h = 0; h < hearings; h++) {
			const o = makeHearing(shift, judge, court.arraignment, clock);
			batch.observations.push(o);
			clock = addSeconds(new Date(o.ended_at!), int(20, 240));
		}
		shift.ended_at = iso(addSeconds(clock, int(2, 15) * 60));
		shift.updated_at = shift.ended_at;
		if (chance(0.2))
			shift.notes = 'Courtroom started late; several cases called while the video link was down.';
		batch.shifts.push(shift);
	}
}

const db = await connect(process.env.DATABASE_URL);
try {
	await migrate(db);
	if (values.reset) {
		await db.exec('delete from observations; delete from shifts;');
		console.log('Removed existing shifts and observations.');
	}
	let shifts = 0;
	let observations = 0;
	for (const [id, batch] of batches) {
		for (let i = 0; i < batch.observations.length || i === 0; i += 500) {
			const result = await applySync(
				db,
				{
					observer: { id, name: batch.name },
					shifts: i === 0 ? batch.shifts : [],
					observations: batch.observations.slice(i, i + 500)
				},
				PROGRAM
			);
			if (result.rejected.length) {
				console.error(JSON.stringify(result.rejected.slice(0, 3), null, 2));
				throw new Error(`${result.rejected.length} generated records failed validation`);
			}
			shifts += result.accepted.shifts.length;
			observations += result.accepted.observations.length;
		}
	}
	console.log(
		`Seeded ${shifts} shifts and ${observations} hearings over ${DAYS} days for "${PROGRAM.name}" (${TIME_ZONE}).`
	);
} finally {
	await db.close();
}
