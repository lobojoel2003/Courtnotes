<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { app } from '#lib/client/app.svelte.ts';
	import { counts, eraseDevice } from '#lib/client/store.ts';
	import { fetchConfig } from '#lib/client/sync.ts';
	import { requestPersistentStorage } from '#lib/client/pwa.svelte.ts';
	import { versionLabel } from '#lib/build-info.ts';
	import Icon from '#lib/components/Icon.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { toast } from '#lib/client/toast.svelte.ts';

	let name = $state(app.settings?.observerName ?? '');
	let code = $state(app.settings?.accessCode ?? '');
	let reveal = $state(false);
	let persisted = $state<boolean | null>(null);
	let wakeLockSupported = $state(false);
	let message = $state<string | null>(null);

	onMount(async () => {
		wakeLockSupported = 'wakeLock' in navigator;
		persisted = (await navigator.storage?.persisted?.()) ?? null;
	});

	async function saveProfile(event: SubmitEvent) {
		event.preventDefault();
		message = null;
		if (!name.trim() || !code.trim()) return (message = 'Name and access code are both required.');
		const changedCode = code.trim() !== app.settings?.accessCode;
		if (changedCode) {
			const result = await fetchConfig(code.trim());
			if (result.status === 'unauthorized') return (message = 'That access code was not accepted.');
		}
		await app.updateSettings({ observerName: name.trim(), accessCode: code.trim() });
		app.problem = null;
		toast('Saved.');
		void app.syncNow();
	}

	async function keepStorage() {
		persisted = await requestPersistentStorage();
		toast(persisted ? 'This phone will keep your records.' : 'Your browser declined; sync often.');
	}

	async function erase() {
		await eraseDevice();
		await app.refreshCounts();
		toast('All records removed from this phone.');
		await goto(resolve('/(watcher)'));
	}

	let unsynced = $state(0);
	$effect(() => {
		void app.pending;
		void counts().then((c) => (unsynced = c.pending + c.rejected));
	});
</script>

<svelte:head><title>Settings · Courtnotes</title></svelte:head>

<section class="stack">
	<h1>Settings</h1>

	<form class="card stack" onsubmit={saveProfile}>
		<h2 class="label">You</h2>
		<label class="field">
			<span>Name or initials</span>
			<input class="input" bind:value={name} maxlength="60" autocomplete="nickname" />
		</label>
		<label class="field">
			<span>Access code</span>
			<div class="row">
				<input
					class="input mono"
					type={reveal ? 'text' : 'password'}
					bind:value={code}
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
				/>
				<button
					type="button"
					class="btn btn-sm"
					onclick={() => (reveal = !reveal)}
					aria-pressed={reveal}
				>
					<Icon name="eye" size={18} label={reveal ? 'Hide code' : 'Show code'} />
				</button>
			</div>
		</label>
		{#if message}<p class="danger" role="alert">{message}</p>{/if}
		<button class="btn btn-primary" type="submit">Save</button>
	</form>

	<div class="card stack">
		<h2 class="label">In the courtroom</h2>
		{#if wakeLockSupported}
			<label class="toggle">
				<span class="grow">
					<strong>Keep screen awake</strong>
					<span class="muted">Stops the phone locking mid-hearing. Uses more battery.</span>
				</span>
				<input
					type="checkbox"
					checked={app.settings?.keepAwake ?? false}
					onchange={(e) => app.updateSettings({ keepAwake: e.currentTarget.checked })}
				/>
			</label>
		{/if}
		<div class="toggle">
			<span class="grow">
				<strong>Silent by design</strong>
				<span class="muted">Courtnotes never plays sounds, vibrates or sends notifications.</span>
			</span>
			<Icon name="check" />
		</div>
		<div class="toggle">
			<span class="grow">
				<strong>Protected storage</strong>
				<span class="muted">
					{persisted
						? 'Your browser has agreed not to clear records stored on this phone.'
						: 'Ask your browser not to clear records when space runs low.'}
				</span>
			</span>
			{#if persisted}
				<Icon name="check" />
			{:else}
				<button class="btn btn-sm" type="button" onclick={keepStorage}>Protect</button>
			{/if}
		</div>
	</div>

	<div class="card stack">
		<h2 class="label">This phone</h2>
		<p class="muted small">
			Device id <span class="mono">{app.settings?.observerId.slice(0, 8)}</span> · {app.programName}
		</p>
		<ConfirmButton
			confirmLabel={unsynced
				? `${unsynced} unsynced! Tap again to erase anyway`
				: 'Tap again to erase'}
			onconfirm={erase}
		>
			<Icon name="trash" size={18} /> Erase all records on this phone
		</ConfirmButton>
	</div>

	<p class="hint center">
		<a href="/login" data-sveltekit-reload>Coordinator sign-in</a> ·
		<a href="https://github.com/lobojoel2003/Courtnotes" rel="noopener" target="_blank">
			About Courtnotes
		</a>
	</p>
	<p class="hint center mono small" data-testid="version">{versionLabel()}</p>
</section>

<style>
	h1 {
		font-size: 1.6rem;
	}
	.row input {
		flex: 1;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-height: var(--tap);
	}
	.toggle input[type='checkbox'] {
		width: 1.6rem;
		height: 1.6rem;
		accent-color: var(--accent);
	}
	.toggle :global(svg) {
		color: var(--ok);
	}
	.grow {
		flex: 1;
		display: grid;
	}
	.grow .muted {
		font-size: 0.92rem;
	}
	.danger {
		color: var(--danger);
		margin: 0;
	}
	.center {
		text-align: center;
	}
	.small {
		font-size: 0.85rem;
		margin: 0;
	}
</style>
