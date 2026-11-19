/**
 * Coordinator accounts and sessions. Passwords are hashed with scrypt; session tokens are random
 * 256-bit values whose SHA-256 hash is what the database stores, so a leaked database can't be
 * replayed as live sessions. No SvelteKit imports, so the CLI scripts can use this too.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { Queryable } from './db.ts';

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
export const SESSION_COOKIE = 'cn_session';
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 10;

export interface Coordinator {
	id: string;
	email: string;
	name: string;
}

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions) {
	return new Promise<Buffer>((resolve, reject) => {
		scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
	});
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const { N, r, p, keylen, maxmem } = SCRYPT;
	const key = await scryptAsync(password.normalize('NFKC'), salt, keylen, { N, r, p, maxmem });
	return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [scheme, n, r, p, salt, hash] = stored.split('$');
	if (scheme !== 'scrypt' || !salt || !hash) return false;
	const expected = Buffer.from(hash, 'base64url');
	const key = await scryptAsync(
		password.normalize('NFKC'),
		Buffer.from(salt, 'base64url'),
		expected.length,
		{ N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem }
	);
	return key.length === expected.length && timingSafeEqual(key, expected);
}

export function normaliseEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function validateNewCoordinator(email: string, password: string): string | null {
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(email)))
		return 'Enter a valid email address.';
	if (password.length < MIN_PASSWORD_LENGTH) {
		return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
	}
	return null;
}

export async function countCoordinators(db: Queryable): Promise<number> {
	const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from coordinators`);
	return rows[0].n;
}

export async function createCoordinator(
	db: Queryable,
	input: { email: string; name: string; password: string }
): Promise<Coordinator> {
	const problem = validateNewCoordinator(input.email, input.password);
	if (problem) throw new Error(problem);
	const { rows } = await db.query<Coordinator>(
		`insert into coordinators (email, name, password_hash) values ($1, $2, $3)
		 on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
		 returning id::text, email, name`,
		[
			normaliseEmail(input.email),
			input.name.trim() || 'Coordinator',
			await hashPassword(input.password)
		]
	);
	return rows[0];
}

// A fixed hash to compare against when the email is unknown, so response time doesn't reveal
// which emails have accounts.
let dummyHash: Promise<string> | undefined;

export async function authenticate(
	db: Queryable,
	email: string,
	password: string
): Promise<Coordinator | null> {
	const { rows } = await db.query<Coordinator & { password_hash: string }>(
		`select id::text, email, name, password_hash from coordinators where email = $1`,
		[normaliseEmail(email)]
	);
	const row = rows[0];
	if (!row) {
		dummyHash ??= hashPassword('not-a-real-password');
		await verifyPassword(password, await dummyHash);
		return null;
	}
	if (!(await verifyPassword(password, row.password_hash))) return null;
	await db.query(`update coordinators set last_login_at = now() where id = $1`, [row.id]);
	return { id: row.id, email: row.email, name: row.name };
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

export async function createSession(
	db: Queryable,
	coordinatorId: string
): Promise<{ token: string; expires: Date }> {
	const token = randomBytes(32).toString('base64url');
	const expires = new Date(Date.now() + SESSION_TTL_MS);
	await db.query(`insert into sessions (id, coordinator_id, expires_at) values ($1, $2, $3)`, [
		hashToken(token),
		coordinatorId,
		expires.toISOString()
	]);
	// Opportunistic cleanup keeps the table small without a cron job.
	await db.query(`delete from sessions where expires_at < now()`);
	return { token, expires };
}

export async function getSessionCoordinator(
	db: Queryable,
	token: string
): Promise<Coordinator | null> {
	const { rows } = await db.query<Coordinator>(
		`select c.id::text, c.email, c.name
		 from sessions s join coordinators c on c.id = s.coordinator_id
		 where s.id = $1 and s.expires_at > now()`,
		[hashToken(token)]
	);
	return rows[0] ?? null;
}

export async function deleteSession(db: Queryable, token: string): Promise<void> {
	await db.query(`delete from sessions where id = $1`, [hashToken(token)]);
}
