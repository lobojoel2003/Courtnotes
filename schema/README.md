# The Courtnotes data standard (v1)

An open, CC0-licensed JSON Schema for court watch observations, so programs in different cities
can pool and compare what they see in court.

| File                                                                   | What it describes                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`v1/court-observation.schema.json`](v1/court-observation.schema.json) | **One hearing** observed by a volunteer (the core record)   |
| [`v1/court-watch-shift.schema.json`](v1/court-watch-shift.schema.json) | **One shift**: a volunteer's block of time in one courtroom |
| [`v1/common.schema.json`](v1/common.schema.json)                       | Shared definitions and every controlled vocabulary          |
| [`v1/examples/`](v1/examples)                                          | Valid example records                                       |

The schemas use [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/release-notes). Their
canonical `$id`s are the raw GitHub URLs of the files on `main`, so validators can resolve them.

## A record at a glance

```json
{
	"schema_version": "1.0.0",
	"id": "0f8fad5b-d9cb-469f-a165-70867728950e",
	"program": { "id": "example-court-watch", "name": "Example County Court Watch" },
	"observer": { "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7" },
	"shift_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
	"court": {
		"name": "Example County Justice Center",
		"courtroom": "Arraignment Court B",
		"jurisdiction": "US-PA"
	},
	"judge": { "name": "Hon. A. Marlowe" },
	"hearing_type": "arraignment",
	"started_at": "2026-03-02T09:14:05-05:00",
	"ended_at": "2026-03-02T09:16:41-05:00",
	"duration_seconds": 156,
	"counsel": "public_defender",
	"outcome": "continued",
	"release_decision": "bail_set",
	"bail": { "amount": 25000, "currency": "USD", "type": "deposit", "prosecution_request": 50000 },
	"judge_remarks": "I don't care that he has a job. Twenty-five thousand, ten percent.",
	"updated_at": "2026-03-02T09:17:30-05:00"
}
```

Required: `schema_version`, `id`, `program.id`, `observer.id`, `court.name`, `hearing_type`,
`started_at`, `updated_at`. Everything else is optional, because volunteers can't always see or hear
everything.

## Controlled vocabularies

Values are lowercase `snake_case` codes. Each code's human label and definition lives in
`common.schema.json` (`oneOf` → `const` / `title` / `description`), so tools can show the same
labels everywhere.

| Field                   | Codes                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hearing_type`          | `arraignment`, `bail_review`, `preliminary_hearing`, `status_conference`, `motion`, `plea`, `sentencing`, `trial`, `probation_violation`, `other`             |
| `counsel`               | `public_defender`, `court_appointed`, `private`, `none`, `waived`, `unknown`                                                                                  |
| `release_decision`      | `released_ror`, `released_conditions`, `bail_set`, `held_without_bail`, `remains_in_custody`, `not_addressed`                                                 |
| `outcome`               | `continued`, `dismissed`, `held_for_trial`, `plea_entered`, `sentenced`, `diversion`, `warrant_issued`, `other`                                               |
| `bail.type`             | `cash`, `secured`, `deposit`, `unsecured`, `other`                                                                                                            |
| `release_conditions[]`  | `pretrial_supervision`, `electronic_monitoring`, `stay_away_order`, `drug_testing`, `treatment`, `curfew`, `travel_restriction`, `firearm_surrender`, `other` |
| `defendant.appearance`  | `in_person`, `video`, `not_present`                                                                                                                           |
| `defendant.interpreter` | `not_needed`, `provided`, `needed_not_provided`                                                                                                               |
| `defendant.perceived_*` | gender, race/ethnicity and age range as **perceived by the observer**; see the schema                                                                         |

## Rules beyond the schema

- `bail` may only appear when `release_decision` is `bail_set` (enforced with `dependentSchemas`).
- `ended_at` must not be before `started_at` (checked by Courtnotes; JSON Schema can't express it).
- Rates in Courtnotes reports use these denominators, and other tools should too:
  - **money bail rate** = `bail_set` ÷ release decisions other than `not_addressed`;
  - **no-lawyer rate** = (`none` + `waived`) ÷ hearings where `counsel` is recorded and not `unknown`.

## Privacy

The standard never has a field for a defendant's name. `case_number`, free-text `notes` and
`observer.name` are the only fields that can identify a person; Courtnotes' **public** exports drop
all three. Judges are public officials acting in public, so their names are kept.

## Extending it

Put program-specific fields under `extensions`, with keys namespaced by your program id:

```json
"extensions": { "example-court-watch:docket_type": "misdemeanor" }
```

## Versioning

`schema_version` follows semver. Minor versions (1.1.0, 1.2.0…) only **add** optional fields or
vocabulary terms, so every 1.x reader can read every 1.x record; anything breaking becomes v2 in a new
`v2/` directory. Changes are listed in the project [CHANGELOG](../CHANGELOG.md).

## License

The schema files in this directory are dedicated to the public domain under
[CC0 1.0](LICENSE). Use them in any tool, for any purpose, without asking. (The Courtnotes
application itself is AGPL-3.0-or-later.)
