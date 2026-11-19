import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { validateObservation } from '../schema/validate.ts';
import {
	buildRecord,
	compact,
	elapsed,
	emptyForm,
	formFromRecord,
	startTimer,
	toggleTimer
} from './hearing.ts';
import { groupDigits, parseAmount, stopwatch } from './format.ts';

const ctx = () => ({
	id: randomUUID(),
	shiftId: randomUUID(),
	observerId: randomUUID(),
	programId: 'court-watch',
	court: { name: 'Example County Justice Center', courtroom: 'B' }
});

describe('timer', () => {
	it('accumulates across pauses', () => {
		let t = startTimer(0);
		expect(elapsed(t, 5000)).toBe(5000);
		t = toggleTimer(t, 5000); // pause
		expect(elapsed(t, 60_000)).toBe(5000);
		expect(t.stoppedAt).toBe(5000);
		t = toggleTimer(t, 60_000); // resume
		expect(elapsed(t, 62_000)).toBe(7000);
	});

	it('formats like a stopwatch', () => {
		expect(stopwatch(0)).toBe('0:00');
		expect(stopwatch(161_000)).toBe('2:41');
		expect(stopwatch(3_761_000)).toBe('1:02:41');
	});
});

describe('bail input', () => {
	it('groups digits as you type and parses back', () => {
		expect(groupDigits('25000')).toBe('25,000');
		expect(groupDigits('$1,0005')).toBe('10,005');
		expect(groupDigits('007')).toBe('7');
		expect(parseAmount('25,000')).toBe(25000);
		expect(parseAmount('')).toBeUndefined();
	});
});

describe('buildRecord', () => {
	it('turns a quick arraignment into a valid standard record', () => {
		const form = {
			...emptyForm('Hon. A. Marlowe'),
			hearing_type: 'arraignment' as const,
			counsel: 'public_defender' as const,
			release_decision: 'bail_set' as const,
			bail_amount: '25,000',
			bail_type: 'deposit' as const,
			prosecution_request: '50,000',
			outcome: 'continued' as const,
			judge_remarks: '  Twenty-five thousand.  '
		};
		const record = buildRecord(form, { ...ctx(), timer: startTimer(1_000_000), now: 1_156_000 });
		expect(record.duration_seconds).toBe(156);
		expect(record.bail).toEqual({
			amount: 25000,
			currency: 'USD',
			type: 'deposit',
			prosecution_request: 50000
		});
		expect(record.judge_remarks).toBe('Twenty-five thousand.');
		expect(record.defendant).toBeUndefined();
		expect(record.case_number).toBeUndefined();
		expect(validateObservation(record)).toMatchObject({ ok: true });
	});

	it('drops the bail amount when bail was not set', () => {
		const form = {
			...emptyForm(),
			hearing_type: 'arraignment' as const,
			release_decision: 'released_ror' as const,
			bail_amount: '500'
		};
		const record = buildRecord(form, { ...ctx(), timer: startTimer(0), now: 60_000 });
		expect(record.bail).toBeUndefined();
		expect(validateObservation(record).ok).toBe(true);
	});

	it('uses the pause time as the end of a paused hearing', () => {
		const t = toggleTimer(startTimer(0), 90_000);
		const record = buildRecord(
			{ ...emptyForm(), hearing_type: 'motion' },
			{ ...ctx(), timer: t, now: 600_000 }
		);
		expect(record.ended_at).toBe(new Date(90_000).toISOString());
		expect(record.duration_seconds).toBe(90);
	});

	it('round-trips through the edit form without losing data', () => {
		const original = buildRecord(
			{
				...emptyForm('Hon. R. Castellan'),
				hearing_type: 'bail_review',
				release_decision: 'released_conditions',
				release_conditions: ['curfew'],
				appearance: 'video',
				in_custody: 'yes',
				perceived_age_range: '25_34',
				case_number: 'CR-2026-0042',
				notes: 'Video froze.'
			},
			{ ...ctx(), timer: startTimer(0), now: 100_000 }
		);
		const form = formFromRecord(original);
		expect(form.in_custody).toBe('yes');
		const edited = buildRecord(
			{ ...form, notes: 'Video froze twice.' },
			{
				...ctx(),
				timer: { ...startTimer(0), runningSince: null, accumulatedMs: 100_000 },
				original,
				now: 500_000
			}
		);
		expect(edited.id).toBe(original.id);
		expect(edited.started_at).toBe(original.started_at);
		expect(edited.ended_at).toBe(original.ended_at);
		expect(edited.notes).toBe('Video froze twice.');
		expect(edited.defendant).toEqual({
			appearance: 'video',
			in_custody: true,
			perceived_age_range: '25_34'
		});
		expect(Date.parse(edited.updated_at)).toBeGreaterThan(Date.parse(original.updated_at));
		expect(validateObservation(edited).ok).toBe(true);
	});

	it('compacts nested empties', () => {
		expect(compact({ a: '', b: [], c: { d: undefined }, e: 0, f: false })).toEqual({
			e: 0,
			f: false
		});
	});
});
