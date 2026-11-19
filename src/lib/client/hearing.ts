/**
 * Pure helpers for the hearing capture screen: the form model, the timer and turning a form
 * into a standard record. Kept free of Svelte so they're unit-tested directly.
 */
import {
	SCHEMA_VERSION,
	type Appearance,
	type BailType,
	type Counsel,
	type HearingType,
	type Interpreter,
	type Observation,
	type Outcome,
	type PerceivedAgeRange,
	type PerceivedGender,
	type PerceivedRaceEthnicity,
	type ReleaseCondition,
	type ReleaseDecision
} from '../schema/types.ts';
import { parseAmount } from './format.ts';

export interface HearingForm {
	hearing_type?: HearingType;
	counsel?: Counsel;
	release_decision?: ReleaseDecision;
	outcome?: Outcome;
	bail_amount: string;
	bail_type?: BailType;
	prosecution_request: string;
	release_conditions: ReleaseCondition[];
	appearance?: Appearance;
	in_custody?: 'yes' | 'no';
	interpreter?: Interpreter;
	perceived_gender?: PerceivedGender;
	perceived_race_ethnicity?: PerceivedRaceEthnicity;
	perceived_age_range?: PerceivedAgeRange;
	case_number: string;
	judge: string;
	judge_remarks: string;
	notes: string;
}

export interface Timer {
	/** When the case was called (epoch ms). */
	firstStartedAt: number;
	/** Set while the timer runs. */
	runningSince: number | null;
	accumulatedMs: number;
	/** When the timer was last paused. */
	stoppedAt?: number | null;
}

export function emptyForm(judge = ''): HearingForm {
	return {
		bail_amount: '',
		prosecution_request: '',
		release_conditions: [],
		case_number: '',
		judge,
		judge_remarks: '',
		notes: ''
	};
}

export function startTimer(now = Date.now()): Timer {
	return { firstStartedAt: now, runningSince: now, accumulatedMs: 0, stoppedAt: null };
}

export function elapsed(timer: Timer, now = Date.now()): number {
	return timer.accumulatedMs + (timer.runningSince !== null ? now - timer.runningSince : 0);
}

export function toggleTimer(timer: Timer, now = Date.now()): Timer {
	return timer.runningSince !== null
		? {
				...timer,
				accumulatedMs: timer.accumulatedMs + (now - timer.runningSince),
				runningSince: null,
				stoppedAt: now
			}
		: { ...timer, runningSince: now, stoppedAt: null };
}

/** Load a saved record back into the form for editing. */
export function formFromRecord(r: Observation): HearingForm {
	const d = r.defendant ?? {};
	return {
		hearing_type: r.hearing_type,
		counsel: r.counsel,
		release_decision: r.release_decision,
		outcome: r.outcome,
		bail_amount: r.bail ? r.bail.amount.toLocaleString('en-US') : '',
		bail_type: r.bail?.type,
		prosecution_request:
			r.bail?.prosecution_request !== undefined
				? r.bail.prosecution_request.toLocaleString('en-US')
				: '',
		release_conditions: [...(r.release_conditions ?? [])],
		appearance: d.appearance,
		in_custody: d.in_custody === undefined ? undefined : d.in_custody ? 'yes' : 'no',
		interpreter: d.interpreter,
		perceived_gender: d.perceived_gender,
		perceived_race_ethnicity: d.perceived_race_ethnicity,
		perceived_age_range: d.perceived_age_range,
		case_number: r.case_number ?? '',
		judge: r.judge?.name ?? '',
		judge_remarks: r.judge_remarks ?? '',
		notes: r.notes ?? ''
	};
}

/** Drop undefined values, empty strings, empty arrays and empty objects. */
export function compact<T>(value: T): T {
	if (Array.isArray(value)) return value.map(compact) as T;
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			const c = compact(v);
			if (c === undefined || c === '') continue;
			if (Array.isArray(c) && !c.length) continue;
			if (c && typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).length) continue;
			out[k] = c;
		}
		return out as T;
	}
	return value;
}

interface BuildContext {
	id: string;
	shiftId: string;
	observerId: string;
	programId: string;
	court: Observation['court'];
	timer: Timer;
	/** The saved record being edited, if any. */
	original?: Observation;
	now?: number;
}

export function buildRecord(form: HearingForm, ctx: BuildContext): Observation {
	const now = ctx.now ?? Date.now();
	const iso = (ms: number) => new Date(ms).toISOString();
	const original = ctx.original;

	const startedAt = original?.started_at ?? iso(ctx.timer.firstStartedAt);
	let endedAt = original?.ended_at;
	const running = ctx.timer.runningSince !== null;
	if (!original || running) {
		endedAt = iso(running ? now : (ctx.timer.stoppedAt ?? now));
	}
	if (endedAt && Date.parse(endedAt) < Date.parse(startedAt)) endedAt = startedAt;

	const amount = parseAmount(form.bail_amount);
	const request = parseAmount(form.prosecution_request);
	const bail =
		form.release_decision === 'bail_set' && amount !== undefined
			? {
					amount,
					currency: original?.bail?.currency ?? 'USD',
					type: form.bail_type,
					prosecution_request: request
				}
			: undefined;

	const record: Observation = {
		...(original ?? {}),
		schema_version: SCHEMA_VERSION,
		id: original?.id ?? ctx.id,
		program: original?.program ?? { id: ctx.programId },
		observer: original?.observer ?? { id: ctx.observerId },
		shift_id: original?.shift_id ?? ctx.shiftId,
		court: original?.court ?? ctx.court,
		judge: form.judge.trim() ? { name: form.judge.trim() } : undefined,
		case_number: form.case_number.trim() || undefined,
		hearing_type: form.hearing_type ?? 'other',
		started_at: startedAt,
		ended_at: endedAt,
		duration_seconds: Math.min(86400, Math.round(elapsed(ctx.timer, now) / 1000)),
		counsel: form.counsel,
		outcome: form.outcome,
		release_decision: form.release_decision,
		bail,
		release_conditions: form.release_conditions.length ? form.release_conditions : undefined,
		defendant: {
			appearance: form.appearance,
			in_custody: form.in_custody === undefined ? undefined : form.in_custody === 'yes',
			interpreter: form.interpreter,
			perceived_gender: form.perceived_gender,
			perceived_race_ethnicity: form.perceived_race_ethnicity,
			perceived_age_range: form.perceived_age_range
		},
		judge_remarks: form.judge_remarks.trim() || undefined,
		notes: form.notes.trim() || undefined,
		recorded_at: original?.recorded_at ?? startedAt,
		updated_at: iso(now)
	};
	return compact(record);
}
