/**
 * Aggregations shared by the dashboard, the published report and the tests. Pure functions over
 * standard records, so any program can reproduce Courtnotes' numbers from an export.
 */
import type { Counsel, Observation, ReleaseDecision, Shift } from './schema/types.ts';
import { label, vocab, type VocabName } from './schema/vocab.ts';

export const REPRESENTED: readonly Counsel[] = ['public_defender', 'court_appointed', 'private'];
export const UNREPRESENTED: readonly Counsel[] = ['none', 'waived'];
/** Release decisions that count as "a decision was made" for rate calculations. */
export const DECIDED: readonly ReleaseDecision[] = [
	'released_ror',
	'released_conditions',
	'bail_set',
	'held_without_bail',
	'remains_in_custody'
];

export function median(values: number[]): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function rate(part: number, whole: number): number | null {
	return whole > 0 ? part / whole : null;
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function dayKey(iso: string, timeZone: string): string {
	let fmt = dayFormatters.get(timeZone);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});
		dayFormatters.set(timeZone, fmt);
	}
	return fmt.format(new Date(iso));
}

export function durationOf(o: Observation): number | null {
	if (typeof o.duration_seconds === 'number') return o.duration_seconds;
	if (o.ended_at) {
		const s = (Date.parse(o.ended_at) - Date.parse(o.started_at)) / 1000;
		return s >= 0 ? Math.round(s) : null;
	}
	return null;
}

function shiftSeconds(s: Shift): number {
	if (!s.ended_at) return 0;
	const seconds = (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000;
	// Ignore shifts someone forgot to end for days.
	return seconds > 0 && seconds < 24 * 3600 ? seconds : 0;
}

export interface Summary {
	hearings: number;
	shifts: number;
	observers: number;
	judges: number;
	days: number;
	watchedSeconds: number;
	medianDurationSeconds: number | null;
	counselKnown: number;
	represented: number;
	unrepresented: number;
	unrepresentedRate: number | null;
	releaseDecided: number;
	ror: number;
	bailSet: number;
	held: number;
	bailSetRate: number | null;
	rorRate: number | null;
	medianBail: number | null;
	meanBail: number | null;
	totalBail: number;
	firstDay: string | null;
	lastDay: string | null;
}

export function summarize(observations: Observation[], shifts: Shift[], timeZone: string): Summary {
	const observers = new Set<string>();
	const judges = new Set<string>();
	const days = new Set<string>();
	const durations: number[] = [];
	const bails: number[] = [];
	let represented = 0;
	let unrepresented = 0;
	let counselKnown = 0;
	let releaseDecided = 0;
	let ror = 0;
	let bailSet = 0;
	let held = 0;

	for (const o of observations) {
		observers.add(o.observer.id);
		if (o.judge?.name) judges.add(o.judge.name);
		days.add(dayKey(o.started_at, timeZone));
		const d = durationOf(o);
		if (d !== null) durations.push(d);
		if (o.counsel && o.counsel !== 'unknown') {
			counselKnown++;
			if (REPRESENTED.includes(o.counsel)) represented++;
			if (UNREPRESENTED.includes(o.counsel)) unrepresented++;
		}
		if (o.release_decision && DECIDED.includes(o.release_decision)) {
			releaseDecided++;
			if (o.release_decision === 'released_ror') ror++;
			if (o.release_decision === 'bail_set') bailSet++;
			if (o.release_decision === 'held_without_bail') held++;
		}
		if (o.release_decision === 'bail_set' && typeof o.bail?.amount === 'number') {
			bails.push(o.bail.amount);
		}
	}
	for (const s of shifts) {
		observers.add(s.observer.id);
		days.add(dayKey(s.started_at, timeZone));
	}

	const sortedDays = [...days].sort();
	const totalBail = bails.reduce((a, b) => a + b, 0);
	return {
		hearings: observations.length,
		shifts: shifts.length,
		observers: observers.size,
		judges: judges.size,
		days: days.size,
		watchedSeconds: shifts.reduce((sum, s) => sum + shiftSeconds(s), 0),
		medianDurationSeconds: median(durations),
		counselKnown,
		represented,
		unrepresented,
		unrepresentedRate: rate(unrepresented, counselKnown),
		releaseDecided,
		ror,
		bailSet,
		held,
		bailSetRate: rate(bailSet, releaseDecided),
		rorRate: rate(ror, releaseDecided),
		medianBail: median(bails),
		meanBail: bails.length ? totalBail / bails.length : null,
		totalBail,
		firstDay: sortedDays[0] ?? null,
		lastDay: sortedDays.at(-1) ?? null
	};
}

export interface JudgeRow {
	judge: string;
	hearings: number;
	releaseDecided: number;
	bailSet: number;
	bailSetRate: number | null;
	rorRate: number | null;
	medianBail: number | null;
	maxBail: number | null;
	unrepresentedRate: number | null;
	medianDurationSeconds: number | null;
}

export const UNKNOWN_JUDGE = 'Unknown judge';

export function byJudge(observations: Observation[]): JudgeRow[] {
	const groups = new Map<string, Observation[]>();
	for (const o of observations) {
		const key = o.judge?.name ?? UNKNOWN_JUDGE;
		let list = groups.get(key);
		if (!list) groups.set(key, (list = []));
		list.push(o);
	}
	const rows: JudgeRow[] = [];
	for (const [judge, list] of groups) {
		const s = summarize(list, [], 'UTC');
		const bails = list
			.filter((o) => o.release_decision === 'bail_set' && typeof o.bail?.amount === 'number')
			.map((o) => o.bail!.amount);
		rows.push({
			judge,
			hearings: list.length,
			releaseDecided: s.releaseDecided,
			bailSet: s.bailSet,
			bailSetRate: s.bailSetRate,
			rorRate: s.rorRate,
			medianBail: s.medianBail,
			maxBail: bails.length ? Math.max(...bails) : null,
			unrepresentedRate: s.unrepresentedRate,
			medianDurationSeconds: s.medianDurationSeconds
		});
	}
	return rows.sort((a, b) => b.hearings - a.hearings || a.judge.localeCompare(b.judge));
}

export interface DayRow {
	date: string;
	hearings: number;
	shifts: number;
}

export function byDay(observations: Observation[], shifts: Shift[], timeZone: string): DayRow[] {
	const days = new Map<string, DayRow>();
	const row = (date: string) => {
		let r = days.get(date);
		if (!r) days.set(date, (r = { date, hearings: 0, shifts: 0 }));
		return r;
	};
	for (const o of observations) row(dayKey(o.started_at, timeZone)).hearings++;
	for (const s of shifts) row(dayKey(s.started_at, timeZone)).shifts++;
	return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface CountRow {
	value: string;
	label: string;
	count: number;
	share: number;
}

type Countable = 'hearing_type' | 'counsel' | 'outcome' | 'release_decision';

/** Counts for one vocabulary field, in vocabulary order, omitting zero rows. */
export function countBy(observations: Observation[], field: Countable): CountRow[] {
	const counts = new Map<string, number>();
	let total = 0;
	for (const o of observations) {
		const v = o[field];
		if (!v) continue;
		counts.set(v, (counts.get(v) ?? 0) + 1);
		total++;
	}
	return vocab(field as VocabName)
		.filter((opt) => counts.has(opt.value))
		.map((opt) => ({
			value: opt.value,
			label: opt.label,
			count: counts.get(opt.value)!,
			share: counts.get(opt.value)! / total
		}));
}

// ---------------------------------------------------------------------------------------------
// Formatting helpers shared by the dashboard and the report
// ---------------------------------------------------------------------------------------------

export function formatMoney(amount: number | null | undefined, currency = 'USD'): string {
	if (amount === null || amount === undefined) return '—';
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency,
		maximumFractionDigits: amount % 1 === 0 ? 0 : 2
	}).format(amount);
}

export function formatPercent(value: number | null | undefined): string {
	if (value === null || value === undefined) return '—';
	return `${Math.round(value * 100)}%`;
}

export function formatDuration(seconds: number | null | undefined): string {
	if (seconds === null || seconds === undefined) return '—';
	const s = Math.round(seconds);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
	return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function formatHours(seconds: number): string {
	const h = seconds / 3600;
	return h >= 10 ? `${Math.round(h)}` : h.toFixed(1);
}

/** Plain-language findings for the published report. Only claims the data supports. */
export function findings(summary: Summary, judges: JudgeRow[]): string[] {
	const out: string[] = [];
	if (!summary.hearings) return out;
	const plural = (n: number, word: string) =>
		`${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

	out.push(
		summary.shifts
			? `Volunteers watched ${formatHours(summary.watchedSeconds)} hours of court across ${plural(summary.shifts, 'shift')} on ${plural(summary.days, 'day')}, observing ${plural(summary.hearings, 'hearing')} before ${plural(summary.judges, 'judge')}.`
			: `Volunteers observed ${plural(summary.hearings, 'hearing')} on ${plural(summary.days, 'day')} before ${plural(summary.judges, 'judge')}.`
	);
	if (summary.medianDurationSeconds !== null) {
		out.push(`The median hearing lasted ${formatDuration(summary.medianDurationSeconds)}.`);
	}
	if (summary.releaseDecided) {
		let line = `Money bail was set in ${formatPercent(summary.bailSetRate)} of the ${plural(summary.releaseDecided, 'release decision')} observed`;
		if (summary.medianBail !== null)
			line += `; the median bail was ${formatMoney(summary.medianBail)}`;
		out.push(
			`${line}. ${formatPercent(summary.rorRate)} of defendants were released on their own recognizance.`
		);
	}
	if (summary.counselKnown) {
		out.push(
			`${formatPercent(summary.unrepresentedRate)} of defendants (${summary.unrepresented.toLocaleString('en-US')} of ${summary.counselKnown.toLocaleString('en-US')}) appeared without a lawyer.`
		);
	}
	const comparable = judges.filter((j) => j.judge !== UNKNOWN_JUDGE && j.releaseDecided >= 10);
	if (comparable.length >= 2) {
		const sorted = [...comparable].sort((a, b) => (b.bailSetRate ?? 0) - (a.bailSetRate ?? 0));
		const high = sorted[0];
		const low = sorted.at(-1)!;
		if ((high.bailSetRate ?? 0) > (low.bailSetRate ?? 0)) {
			out.push(
				`Among judges with at least 10 release decisions, ${high.judge} set money bail most often (${formatPercent(high.bailSetRate)}) and ${low.judge} least often (${formatPercent(low.bailSetRate)}).`
			);
		}
	}
	return out;
}

export { label };
