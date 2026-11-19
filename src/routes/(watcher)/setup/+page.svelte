<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { app } from '#lib/client/app.svelte.ts';
	import { fetchConfig } from '#lib/client/sync.ts';
	import { requestPersistentStorage } from '#lib/client/pwa.svelte.ts';
	import Logo from '#lib/components/Logo.svelte';
	import Icon from '#lib/components/Icon.svelte';

	let name = $state(app.settings?.observerName ?? '');
	let code = $state(app.settings?.accessCode ?? '');
	let checking = $state(false);
	let error = $state<string | null>(null);
	let offlineNotice = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		if (!name.trim()) return (error = 'Enter your name or initials.');
		if (!code.trim()) return (error = 'Enter the access code from your coordinator.');
		checking = true;
		// Make sure a device id exists before the first request.
		await app.updateSettings({});
		const result = await fetchConfig(code.trim());
		checking = false;
		if (result.status === 'unauthorized') {
			return (error = 'That access code was not accepted. Check it with your coordinator.');
		}
		if (result.status === 'disabled') {
			return (error = result.message ?? 'This server is not accepting volunteer data yet.');
		}
		if (result.status === 'offline' && !offlineNotice) {
			// Basements happen. Let people start anyway; the code is checked on first sync.
			offlineNotice = true;
			return;
		}
		await app.updateSettings({ observerName: name.trim(), accessCode: code.trim() });
		await requestPersistentStorage();
		await goto(resolve('/(watcher)'), { replaceState: true });
		void app.syncNow();
	}
</script>

<svelte:head><title>Set up · Courtnotes</title></svelte:head>

<section class="setup">
	<div class="intro">
		<Logo size={64} />
		<h1>Courtnotes</h1>
		<p class="muted">
			Record what happens in court: quietly, quickly, even with no signal. Your notes stay on this
			phone until they reach your program's server.
		</p>
	</div>

	<form class="stack card" onsubmit={submit} novalidate>
		<label class="field">
			<span>Your name or initials</span>
			<input
				class="input"
				bind:value={name}
				autocomplete="nickname"
				maxlength="60"
				placeholder="e.g. Sam R."
				required
			/>
		</label>
		<label class="field">
			<span>Program access code</span>
			<input
				class="input mono"
				bind:value={code}
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				maxlength="200"
				placeholder="From your coordinator"
				required
			/>
		</label>

		{#if error}
			<p class="notice danger" role="alert"><Icon name="alert" size={18} /> {error}</p>
		{/if}
		{#if offlineNotice}
			<p class="notice" role="status">
				<Icon name="cloudOff" size={18} /> You're offline, so the code can't be checked yet. You can start
				recording now; it will be checked on the first sync.
			</p>
		{/if}

		<button class="btn btn-primary btn-xl btn-block" type="submit" disabled={checking}>
			{checking ? 'Checking…' : offlineNotice ? 'Continue offline' : 'Continue'}
		</button>
	</form>

	<p class="hint center">
		Coordinator? <a href="/login" data-sveltekit-reload>Sign in to the dashboard</a>
	</p>
</section>

<style>
	.setup {
		display: grid;
		gap: 1.5rem;
		padding-top: max(2rem, env(safe-area-inset-top));
	}
	.intro {
		display: grid;
		justify-items: center;
		text-align: center;
		gap: 0.75rem;
	}
	h1 {
		font-size: 2rem;
	}
	.intro p {
		max-width: 26rem;
		margin: 0;
	}
	.notice {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
		margin: 0;
		padding: 0.75rem 0.9rem;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text-2);
	}
	.notice.danger {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.notice :global(svg) {
		flex: none;
		margin-top: 0.15rem;
	}
	.center {
		text-align: center;
	}
</style>
