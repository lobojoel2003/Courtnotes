#!/usr/bin/env node
/**
 * Create a coordinator account, or reset an existing coordinator's password.
 *
 *   npm run coordinator:create -- --email pat@example.org --name "Pat Smith"
 *
 * The password is read from COORDINATOR_PASSWORD, or prompted for (input hidden).
 * In Docker:  docker compose exec app node scripts/create-coordinator.ts --email …
 */
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { connect } from '../src/lib/server/db.ts';
import { migrate } from '../src/lib/server/migrations.ts';
import { createCoordinator, MIN_PASSWORD_LENGTH } from '../src/lib/server/auth.ts';

const { values } = parseArgs({
	options: {
		email: { type: 'string' },
		name: { type: 'string', default: 'Coordinator' }
	}
});

if (!values.email) {
	console.error('Usage: npm run coordinator:create -- --email <email> [--name "<name>"]');
	process.exit(1);
}

async function promptHidden(question: string): Promise<string> {
	let muted = false;
	const output = new Writable({
		write(chunk: Buffer | string, _encoding, callback) {
			if (!muted) process.stdout.write(chunk);
			callback();
		}
	});
	const rl = createInterface({ input: process.stdin, output, terminal: true });
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			process.stdout.write('\n');
			resolve(answer);
		});
		muted = true;
	});
}

let password = process.env.COORDINATOR_PASSWORD ?? '';
if (!password) {
	password = await promptHidden(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `);
	const again = await promptHidden('Repeat password: ');
	if (password !== again) {
		console.error('Passwords did not match.');
		process.exit(1);
	}
}

const db = await connect(process.env.DATABASE_URL);
try {
	await migrate(db);
	const coordinator = await createCoordinator(db, {
		email: values.email,
		name: values.name ?? 'Coordinator',
		password
	});
	console.log(`Coordinator ready: ${coordinator.email}`);
} catch (err) {
	console.error((err as Error).message);
	process.exitCode = 1;
} finally {
	await db.close();
}
