import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/context.ts';
import { deleteSession, SESSION_COOKIE } from '#lib/server/auth.ts';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await deleteSession(await getDb(), token);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/login');
};
