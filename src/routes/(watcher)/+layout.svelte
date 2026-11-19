<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { app } from '#lib/client/app.svelte.ts';
	import Logo from '#lib/components/Logo.svelte';
	import SyncBadge from '#lib/components/SyncBadge.svelte';
	import TabBar from '#lib/components/TabBar.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Full-screen task flows hide the tab bar so a stray tap can't lose your place.
	const focused = $derived(
		['/setup', '/hearing', '/shift/new'].some((p) => page.url.pathname.startsWith(p))
	);

	onMount(() => {
		let stop: (() => void) | undefined;
		void app.load().then(() => {
			if (!app.configured && page.url.pathname !== '/setup')
				void goto(resolve('/(watcher)/setup'), { replaceState: true });
			stop = app.start();
		});
		return () => stop?.();
	});
</script>

{#if app.ready}
	{#if !focused}
		<header>
			<a class="brand" href="/">
				<Logo size={30} />
				<span>{app.programName}</span>
			</a>
			<SyncBadge />
		</header>
	{/if}
	<main class:focused>
		{@render children()}
	</main>
	{#if !focused}<TabBar />{/if}
	<Toast />
{:else}
	<div class="boot" aria-busy="true"><Logo size={56} /></div>
{/if}

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: calc(0.6rem + env(safe-area-inset-top)) 1rem 0.6rem;
		background: rgb(12 13 15 / 0.94);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--border);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex: 1;
		min-width: 0;
		color: var(--text);
		text-decoration: none;
		font-weight: 700;
	}
	.brand span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem 1rem calc(6rem + env(safe-area-inset-bottom));
	}
	main.focused {
		padding-bottom: 2rem;
	}
	.boot {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		opacity: 0.6;
	}
</style>
