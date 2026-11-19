import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
	byDay,
	byJudge,
	countBy,
	dayKey,
	findings,
	formatDuration,
	formatMoney,
	formatPercent,
	median,
	summarize,
	UNKNOWN_JUDGE
} from './stats.ts';
import { csvCell, OBSERVATION_COLUMNS, publicObservation, toCsv } from './csv.ts';
import { makeObservation, makeShift } from './server/test-helpers.ts';

const watcher = randomUUID();

describe('median', () => {
	it('handles odd, even and empty inputs', () => {
		expect(median([])).toBeNull();
		expect(median([5, 1, 3])).toBe(3);
		expect(median([4, 1, 3, 2])).toBe(2.5);
	});
});

describe('summarize', () => {
	const observations = [
		makeObservation(watcher, { bail: { amount: 1000 }, counsel: 'public_defender' }),
		makeObservation(watcher, { bail: { amount: 5000 }, counsel: 'none' }),
		makeObservation(watcher, {
			release_decision: 'released_ror',
			bail: undefined,
			counsel: 'unknown',
			judge: { name: 'Hon. R. Castellan' }
		}),
		makeObservation(watcher, {
			release_decision: 'not_addressed',
			bail: undefined,
			counsel: 'private',
			judge: undefined,
			duration_seconds: undefined,
			ended_at: undefined
		})
	];
	const shifts = [makeShift(watcher)];
	const s = summarize(observations, shifts, 'UTC');

	it('counts coverage', () => {
		expect(s.hearings).toBe(4);
		expect(s.shifts).toBe(1);
		expect(s.observers).toBe(1);
		expect(s.judges).toBe(2);
		expect(s.days).toBe(1);
		expect(s.watchedSeconds).toBe(3 * 3600);
	});

	it('computes rates over the right denominators', () => {
		// "not_addressed" isn't a decision; "unknown" counsel isn't known.
		expect(s.releaseDecided).toBe(3);
		expect(s.bailSetRate).toBeCloseTo(2 / 3);
		expect(s.rorRate).toBeCloseTo(1 / 3);
		expect(s.counselKnown).toBe(3);
		expect(s.unrepresentedRate).toBeCloseTo(1 / 3);
		expect(s.medianBail).toBe(3000);
		expect(s.meanBail).toBe(3000);
		expect(s.medianDurationSeconds).toBe(156);
	});

	it('groups by judge, day and vocabulary', () => {
		const judges = byJudge(observations);
		expect(judges[0]).toMatchObject({
			judge: 'Hon. A. Marlowe',
			hearings: 2,
			bailSet: 2,
			maxBail: 5000
		});
		expect(judges.map((j) => j.judge)).toContain(UNKNOWN_JUDGE);
		expect(byDay(observations, shifts, 'UTC')).toEqual([
			{ date: '2026-03-02', hearings: 4, shifts: 1 }
		]);
		const release = countBy(observations, 'release_decision');
		expect(release.map((r) => r.value)).toEqual(['released_ror', 'bail_set', 'not_addressed']);
		expect(release.find((r) => r.value === 'bail_set')?.share).toBe(0.5);
	});

	it('writes findings the data supports', () => {
		const lines = findings(s, byJudge(observations));
		expect(lines[0]).toMatch(/observing 4 hearings before 2 judges/);
		expect(lines.join(' ')).toMatch(/median bail was \$3,000/);
		expect(findings(summarize([], [], 'UTC'), [])).toEqual([]);
	});
});

describe('formatting', () => {
	it('formats money, percentages and durations', () => {
		expect(formatMoney(25000)).toBe('$25,000');
		expect(formatMoney(null)).toBe('—');
		expect(formatPercent(0.666)).toBe('67%');
		expect(formatDuration(42)).toBe('42s');
		expect(formatDuration(156)).toBe('2m 36s');
		expect(formatDuration(3 * 3600 + 120)).toBe('3h 02m');
	});

	it('buckets days in the requested time zone', () => {
		expect(dayKey('2026-04-02T03:30:00Z', 'UTC')).toBe('2026-04-02');
		expect(dayKey('2026-04-02T03:30:00Z', 'America/New_York')).toBe('2026-04-01');
	});
});

describe('csv', () => {
	it('escapes quotes, commas and newlines and neutralises formulas', () => {
		expect(csvCell('plain')).toBe('plain');
		expect(csvCell('a,b')).toBe('"a,b"');
		expect(csvCell('say "hi"\nok')).toBe('"say ""hi""\nok"');
		expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
		expect(csvCell(-5)).toBe('-5');
		expect(csvCell(true)).toBe('true');
		expect(csvCell(undefined)).toBe('');
	});

	it('exports a header and one line per record, dropping private columns for public data', () => {
		const o = makeObservation(watcher, {
			case_number: 'CR-1',
			notes: 'private',
			observer: { id: watcher, name: 'Sam' },
			release_conditions: ['curfew', 'drug_testing']
		});
		const full = toCsv([o], OBSERVATION_COLUMNS).trimEnd().split('\r\n');
		expect(full).toHaveLength(2);
		expect(full[0].split(',')).toContain('case_number');
		expect(full[1]).toContain('curfew;drug_testing');
		const pub = toCsv([o], OBSERVATION_COLUMNS, { public: true });
		expect(pub).not.toContain('case_number');
		expect(pub).not.toContain('CR-1');
		expect(pub).not.toContain('Sam');

		const stripped = publicObservation(o);
		expect(stripped.case_number).toBeUndefined();
		expect(stripped.observer).toEqual({ id: watcher });
		expect(o.case_number).toBe('CR-1');
	});
});
