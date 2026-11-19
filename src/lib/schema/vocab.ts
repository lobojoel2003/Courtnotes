/**
 * Human-readable labels for the controlled vocabularies, read straight from the
 * JSON Schema so the app, exports and reports can never disagree with the standard.
 */
import common from '../../../schema/v1/common.schema.json' with { type: 'json' };

export interface VocabOption<T extends string = string> {
	value: T;
	label: string;
	description?: string;
}

export type VocabName =
	| 'hearing_type'
	| 'counsel'
	| 'outcome'
	| 'release_decision'
	| 'bail_type'
	| 'release_condition'
	| 'appearance'
	| 'interpreter'
	| 'perceived_gender'
	| 'perceived_race_ethnicity'
	| 'perceived_age_range';

interface OneOfEntry {
	const: string;
	title: string;
	description?: string;
}

const defs = common.$defs as unknown as Record<string, { oneOf?: OneOfEntry[] }>;

const cache = new Map<VocabName, VocabOption[]>();

export function vocab<T extends string = string>(name: VocabName): VocabOption<T>[] {
	let options = cache.get(name);
	if (!options) {
		const entries = defs[name]?.oneOf;
		if (!entries) throw new Error(`Unknown vocabulary: ${name}`);
		options = entries.map((e) => ({ value: e.const, label: e.title, description: e.description }));
		cache.set(name, options);
	}
	return options as VocabOption<T>[];
}

/** Label for a vocabulary value, falling back to the raw value (or an em dash when empty). */
export function label(name: VocabName, value: string | null | undefined): string {
	if (value === null || value === undefined || value === '') return '—';
	return vocab(name).find((o) => o.value === value)?.label ?? value;
}
