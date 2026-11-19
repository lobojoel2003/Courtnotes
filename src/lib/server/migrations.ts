/**
 * Database migrations, applied in order and recorded in `schema_migrations`.
 * Never edit a migration that has shipped in a release; add a new one instead.
 */
import type { Database } from './db.ts';

export interface Migration {
	id: string;
	sql: string;
}

export const migrations: Migration[] = [
	{
		id: '001_initial',
		sql: /* sql */ `
			create table shifts (
				id uuid primary key,
				observer_id uuid not null,
				observer_name text,
				court_name text not null,
				courtroom text,
				judge_name text,
				started_at timestamptz not null,
				ended_at timestamptz,
				record jsonb not null,
				updated_at timestamptz not null,
				received_at timestamptz not null default now(),
				deleted_at timestamptz
			);
			create index shifts_started_at_idx on shifts (started_at);

			create table observations (
				id uuid primary key,
				shift_id uuid,
				observer_id uuid not null,
				court_name text not null,
				courtroom text,
				judge_name text,
				hearing_type text not null,
				release_decision text,
				bail_amount numeric(14, 2),
				started_at timestamptz not null,
				record jsonb not null,
				updated_at timestamptz not null,
				received_at timestamptz not null default now(),
				deleted_at timestamptz,
				excluded boolean not null default false,
				excluded_reason text
			);
			create index observations_started_at_idx on observations (started_at);
			create index observations_judge_idx on observations (judge_name);
			create index observations_court_idx on observations (court_name);
			create index observations_shift_idx on observations (shift_id);

			create table coordinators (
				id uuid primary key default gen_random_uuid(),
				email text not null unique,
				name text not null,
				password_hash text not null,
				created_at timestamptz not null default now(),
				last_login_at timestamptz
			);

			create table sessions (
				id text primary key,
				coordinator_id uuid not null references coordinators (id) on delete cascade,
				created_at timestamptz not null default now(),
				expires_at timestamptz not null
			);
			create index sessions_expires_at_idx on sessions (expires_at);
		`
	}
];

/** Apply pending migrations. Safe to call from several processes at once. */
export async function migrate(
	db: Database,
	log: (msg: string) => void = () => {}
): Promise<string[]> {
	return db.transaction(async (tx) => {
		// Serialise concurrent app instances starting at the same time.
		await tx.query(`select pg_advisory_xact_lock(7426150001)`);
		await tx.query(`
			create table if not exists schema_migrations (
				id text primary key,
				applied_at timestamptz not null default now()
			)
		`);
		const { rows } = await tx.query<{ id: string }>(`select id from schema_migrations`);
		const applied = new Set(rows.map((r) => r.id));
		const ran: string[] = [];
		for (const migration of migrations) {
			if (applied.has(migration.id)) continue;
			log(`applying migration ${migration.id}`);
			await tx.exec(migration.sql);
			await tx.query(`insert into schema_migrations (id) values ($1)`, [migration.id]);
			ran.push(migration.id);
		}
		return ran;
	});
}
