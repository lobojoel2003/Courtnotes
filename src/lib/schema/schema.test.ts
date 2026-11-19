import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import common from '../../../schema/v1/common.schema.json' with { type: 'json' };
import { validateObservation, validateShift } from './validate.ts';
import * as T from './types.ts';
import { label, vocab, type VocabName } from './vocab.ts';

const examplesDir = join(import.meta.dirname, '../../../schema/v1/examples');
const load = (file: string): Record<string, unknown> =>
	JSON.parse(readFileSync(join(examplesDir, file), 'utf8')) as Record<string, unknown>;

describe('schema examples', () => {
	for (const file of readdirSync(examplesDir)) {
		it(`${file} is valid`, () => {
			const record = load(file);
			const result = file.startsWith('shift') ? validateShift(record) : validateObservation(record);
			expect(result).toMatchObject({ ok: true });
		});
	}
});

describe('validateObservation', () => {
	const base = () => load('arraignment-bail-set.json');

	it('rejects unknown top-level properties', () => {
		const result = validateObservation({ ...base(), defendant_name: 'Jane Doe' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.issues[0].message).toContain('defendant_name');
	});

	it('rejects values outside the vocabulary', () => {
		const result = validateObservation({ ...base(), hearing_type: 'kangaroo_court' });
		expect(result).toMatchObject({ ok: false, issues: [{ path: '/hearing_type' }] });
	});

	it('requires release_decision=bail_set whenever bail is present', () => {
		const result = validateObservation({ ...base(), release_decision: 'released_ror' });
		expect(result.ok).toBe(false);
	});

	it('rejects negative bail', () => {
		const record = base();
		record.bail = { amount: -1 };
		expect(validateObservation(record).ok).toBe(false);
	});

	it('rejects hearings that end before they start', () => {
		const result = validateObservation({
			...base(),
			ended_at: '2026-03-02T09:00:00-05:00'
		});
		expect(result).toMatchObject({ ok: false, issues: [{ path: '/ended_at' }] });
	});

	it('rejects extensions that are not namespaced', () => {
		expect(validateObservation({ ...base(), extensions: { docket: 'x' } }).ok).toBe(false);
	});

	it('requires the core fields', () => {
		const record = base();
		delete record.started_at;
		expect(validateObservation(record).ok).toBe(false);
	});

	it('accepts minor schema versions from the same major line', () => {
		expect(validateObservation({ ...base(), schema_version: '1.4.0' }).ok).toBe(true);
		expect(validateObservation({ ...base(), schema_version: '2.0.0' }).ok).toBe(false);
	});
});

describe('vocabularies', () => {
	const pairs: [VocabName, readonly string[]][] = [
		['hearing_type', T.HEARING_TYPES],
		['counsel', T.COUNSEL],
		['outcome', T.OUTCOMES],
		['release_decision', T.RELEASE_DECISIONS],
		['bail_type', T.BAIL_TYPES],
		['release_condition', T.RELEASE_CONDITIONS],
		['appearance', T.APPEARANCES],
		['interpreter', T.INTERPRETER],
		['perceived_gender', T.PERCEIVED_GENDER],
		['perceived_race_ethnicity', T.PERCEIVED_RACE_ETHNICITY],
		['perceived_age_range', T.PERCEIVED_AGE_RANGE]
	];

	for (const [name, values] of pairs) {
		it(`${name} matches the schema`, () => {
			expect(vocab(name).map((o) => o.value)).toEqual([...values]);
		});
	}

	it('labels every term', () => {
		for (const [name] of pairs) {
			for (const option of vocab(name)) expect(option.label.length).toBeGreaterThan(0);
		}
		expect(label('release_decision', 'released_ror')).toBe('Released (ROR)');
		expect(label('counsel', undefined)).toBe('—');
		expect(label('counsel', 'mystery')).toBe('mystery');
	});

	it('schema version constant matches the schema examples', () => {
		expect(common.$defs.schema_version.examples).toContain(T.SCHEMA_VERSION);
	});
});
