/**
 * Validates records against the Courtnotes JSON Schema (draft 2020-12).
 *
 * Used by the sync API (server-side), the seed script and the test-suite.
 * Ajv generates code with `new Function`, so keep this out of client bundles.
 */
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import common from '../../../schema/v1/common.schema.json' with { type: 'json' };
import observationSchema from '../../../schema/v1/court-observation.schema.json' with { type: 'json' };
import shiftSchema from '../../../schema/v1/court-watch-shift.schema.json' with { type: 'json' };
import type { Observation, Shift } from './types.ts';

// ajv-formats ships CommonJS; depending on the loader the plugin is the default export
// or hangs off `.default`.
const addFormats = ((addFormatsImport as unknown as { default?: unknown }).default ??
	addFormatsImport) as (ajv: Ajv2020) => Ajv2020;

export interface ValidationIssue {
	path: string;
	message: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

let compiled: { observation: ValidateFunction; shift: ValidateFunction } | undefined;

function validators() {
	if (!compiled) {
		const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
		addFormats(ajv);
		ajv.addSchema(common);
		compiled = {
			observation: ajv.compile(observationSchema),
			shift: ajv.compile(shiftSchema)
		};
	}
	return compiled;
}

function toIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
	if (!errors?.length) return [{ path: '/', message: 'is invalid' }];
	// `oneOf` vocabularies produce one error per allowed term; collapse them into one readable line.
	const seen = new Set<string>();
	const issues: ValidationIssue[] = [];
	for (const e of errors) {
		const path = e.instancePath || '/';
		let message = e.message ?? 'is invalid';
		if (e.keyword === 'const' || e.keyword === 'oneOf') message = 'is not an allowed value';
		if (e.keyword === 'additionalProperties') {
			message = `has unknown property "${(e.params as { additionalProperty: string }).additionalProperty}"`;
		}
		const key = `${path} ${message}`;
		if (seen.has(key)) continue;
		seen.add(key);
		issues.push({ path, message });
	}
	return issues;
}

/** Checks the rules JSON Schema can't express. */
function semanticIssues(record: { started_at: string; ended_at?: string }): ValidationIssue[] {
	if (record.ended_at && Date.parse(record.ended_at) < Date.parse(record.started_at)) {
		return [{ path: '/ended_at', message: 'must not be before started_at' }];
	}
	return [];
}

export function validateObservation(input: unknown): ValidationResult<Observation> {
	const { observation } = validators();
	if (!observation(input)) return { ok: false, issues: toIssues(observation.errors) };
	const record = input as Observation;
	const extra = semanticIssues(record);
	return extra.length ? { ok: false, issues: extra } : { ok: true, value: record };
}

export function validateShift(input: unknown): ValidationResult<Shift> {
	const { shift } = validators();
	if (!shift(input)) return { ok: false, issues: toIssues(shift.errors) };
	const record = input as Shift;
	const extra = semanticIssues(record);
	return extra.length ? { ok: false, issues: extra } : { ok: true, value: record };
}
