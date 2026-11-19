/**
 * TypeScript mirror of the Courtnotes open data standard (schema/v1).
 *
 * The JSON Schema files in /schema are the source of truth. `vocab.test.ts`
 * fails if the vocabularies here drift from the schema.
 */

export const SCHEMA_VERSION = '1.0.0';

export const HEARING_TYPES = [
	'arraignment',
	'bail_review',
	'preliminary_hearing',
	'status_conference',
	'motion',
	'plea',
	'sentencing',
	'trial',
	'probation_violation',
	'other'
] as const;

export const COUNSEL = [
	'public_defender',
	'court_appointed',
	'private',
	'none',
	'waived',
	'unknown'
] as const;

export const OUTCOMES = [
	'continued',
	'dismissed',
	'held_for_trial',
	'plea_entered',
	'sentenced',
	'diversion',
	'warrant_issued',
	'other'
] as const;

export const RELEASE_DECISIONS = [
	'released_ror',
	'released_conditions',
	'bail_set',
	'held_without_bail',
	'remains_in_custody',
	'not_addressed'
] as const;

export const BAIL_TYPES = ['cash', 'secured', 'deposit', 'unsecured', 'other'] as const;

export const RELEASE_CONDITIONS = [
	'pretrial_supervision',
	'electronic_monitoring',
	'stay_away_order',
	'drug_testing',
	'treatment',
	'curfew',
	'travel_restriction',
	'firearm_surrender',
	'other'
] as const;

export const APPEARANCES = ['in_person', 'video', 'not_present'] as const;
export const INTERPRETER = ['not_needed', 'provided', 'needed_not_provided'] as const;
export const PERCEIVED_GENDER = ['woman', 'man', 'another_gender', 'unsure'] as const;
export const PERCEIVED_RACE_ETHNICITY = [
	'black',
	'latino',
	'white',
	'asian',
	'indigenous',
	'middle_eastern',
	'another',
	'unsure'
] as const;
export const PERCEIVED_AGE_RANGE = [
	'under_18',
	'18_24',
	'25_34',
	'35_44',
	'45_54',
	'55_64',
	'65_plus',
	'unsure'
] as const;

export type HearingType = (typeof HEARING_TYPES)[number];
export type Counsel = (typeof COUNSEL)[number];
export type Outcome = (typeof OUTCOMES)[number];
export type ReleaseDecision = (typeof RELEASE_DECISIONS)[number];
export type BailType = (typeof BAIL_TYPES)[number];
export type ReleaseCondition = (typeof RELEASE_CONDITIONS)[number];
export type Appearance = (typeof APPEARANCES)[number];
export type Interpreter = (typeof INTERPRETER)[number];
export type PerceivedGender = (typeof PERCEIVED_GENDER)[number];
export type PerceivedRaceEthnicity = (typeof PERCEIVED_RACE_ETHNICITY)[number];
export type PerceivedAgeRange = (typeof PERCEIVED_AGE_RANGE)[number];

export interface Program {
	id: string;
	name?: string;
}

export interface Observer {
	id: string;
	name?: string;
}

export interface Court {
	name: string;
	courtroom?: string;
	jurisdiction?: string;
	county?: string;
}

export interface Judge {
	name: string;
}

export interface Bail {
	amount: number;
	currency?: string;
	type?: BailType;
	prosecution_request?: number;
}

export interface Defendant {
	appearance?: Appearance;
	in_custody?: boolean;
	interpreter?: Interpreter;
	perceived_gender?: PerceivedGender;
	perceived_race_ethnicity?: PerceivedRaceEthnicity;
	perceived_age_range?: PerceivedAgeRange;
}

/** One observed hearing — `schema/v1/court-observation.schema.json`. */
export interface Observation {
	schema_version: string;
	id: string;
	program: Program;
	observer: Observer;
	shift_id?: string;
	court: Court;
	judge?: Judge;
	case_number?: string;
	hearing_type: HearingType;
	started_at: string;
	ended_at?: string;
	duration_seconds?: number;
	counsel?: Counsel;
	outcome?: Outcome;
	release_decision?: ReleaseDecision;
	bail?: Bail;
	release_conditions?: ReleaseCondition[];
	defendant?: Defendant;
	judge_remarks?: string;
	notes?: string;
	recorded_at?: string;
	updated_at: string;
	extensions?: Record<string, unknown>;
}

/** One watcher's block of time in one courtroom — `schema/v1/court-watch-shift.schema.json`. */
export interface Shift {
	schema_version: string;
	id: string;
	program: Program;
	observer: Observer;
	court: Court;
	judge?: Judge;
	started_at: string;
	ended_at?: string;
	notes?: string;
	updated_at: string;
	extensions?: Record<string, unknown>;
}
