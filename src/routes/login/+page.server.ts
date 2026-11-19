import { fail, redirect } from '@sveltejs/kit';
import { formText } from '#lib/url.ts';
import type { Actions, PageServerLoad } from './$types';
import { dev } from '$app/env';
import { getDb } from '#lib/server/context.ts';
import {
	authenticate,
	countCoordinators,
	createSession,
	SESSION_COOKIE
} from '#lib/server/auth.ts';
import { loginLimiter } from '#lib/server/rate-limit.ts';

function safeNext(value: string | null): string {
	// Only same-site dashboard paths, never an open redirect.
	return value && /^\/dashboard(\/[\w\-/]*)?(\?[^\s]*)?$/.test(value) ? value : '/dashboard';
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.coordinator) redirect(303, safeNext(url.searchParams.get('next')));
	return { hasCoordinators: (await countCoordinators(await getDb())) > 0 };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const client = getClientAddress();
		const wait = loginLimiter.retryAfter(client);
		if (wait) {
			return fail(429, {
				email: '',
				message: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minutes.`
			});
		}
		const form = await request.formData();
		const email = formText(form, 'email', 200);
		const password = formText(form, 'password', 500);
		if (!email || !password) return fail(400, { email, message: 'Enter your email and password.' });

		const db = await getDb();
		const coordinator = await authenticate(db, email, password);
		if (!coordinator) {
			loginLimiter.hit(client);
			return fail(400, { email, message: 'That email and password don’t match an account.' });
		}
		loginLimiter.reset(client);
		const { token, expires } = await createSession(db, coordinator.id);
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev && url.protocol === 'https:',
			expires
		});
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
