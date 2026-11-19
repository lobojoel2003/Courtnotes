<script lang="ts">
	import { enhance } from '$app/forms';
	import Logo from '#lib/components/Logo.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Coordinator sign in · Courtnotes</title></svelte:head>

<main>
	<form
		method="POST"
		class="card stack"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<div class="brand">
			<Logo size={48} />
			<div>
				<h1>Coordinator sign in</h1>
				<p class="muted">Courtnotes dashboard</p>
			</div>
		</div>

		{#if !data.hasCoordinators}
			<p class="notice">
				No coordinator accounts exist yet. Set <code>COORDINATOR_EMAIL</code> and
				<code>COORDINATOR_PASSWORD</code> and restart the server, or run
				<code>npm run coordinator:create</code>.
			</p>
		{/if}

		<label class="field">
			<span>Email</span>
			<input
				class="input"
				name="email"
				type="email"
				autocomplete="username"
				required
				value={form?.email ?? ''}
			/>
		</label>
		<label class="field">
			<span>Password</span>
			<input
				class="input"
				name="password"
				type="password"
				autocomplete="current-password"
				required
			/>
		</label>
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<button class="btn btn-primary btn-block" type="submit" disabled={busy}>
			{busy ? 'Signing in…' : 'Sign in'}
		</button>
		<p class="hint">Volunteers don’t need an account: <a href="/">open the watcher app</a>.</p>
	</form>
</main>

<style>
	main {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 1.5rem;
	}
	form {
		width: min(100%, 26rem);
		padding: 1.5rem;
	}
	.brand {
		display: flex;
		gap: 0.9rem;
		align-items: center;
		margin-bottom: 0.5rem;
	}
	h1 {
		font-size: 1.3rem;
	}
	.brand p {
		margin: 0.15rem 0 0;
	}
	.error {
		color: var(--danger);
		margin: 0;
	}
	.notice {
		margin: 0;
		padding: 0.75rem;
		border-radius: var(--radius-sm);
		background: var(--accent-soft);
		color: var(--text-2);
		font-size: 0.92rem;
	}
	code {
		font-family: var(--mono);
		font-size: 0.85em;
		color: var(--accent);
	}
</style>
