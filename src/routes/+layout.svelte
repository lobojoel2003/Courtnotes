<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { dev } from '$app/env';
	import { pwa } from '#lib/client/pwa.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(() => {
		// The service worker makes the watcher app work offline. Skipped in dev so hot reload works.
		if (!dev) void pwa.register();
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
	<link rel="icon" href="/icons/icon-32.png" sizes="32x32" type="image/png" />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#0c0d0f" />
	<meta name="color-scheme" content="dark" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta
		name="description"
		content="Courtnotes: offline-first data collection for court watch programs."
	/>
</svelte:head>

{#if pwa.updateReady}
	<div class="update" role="status">
		<span>A new version of Courtnotes is ready.</span>
		<button class="btn btn-sm btn-primary" type="button" onclick={() => pwa.applyUpdate()}>
			Reload
		</button>
	</div>
{/if}

{@render children()}

<style>
	.update {
		position: sticky;
		top: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: var(--surface-3);
		border-bottom: 1px solid var(--border-strong);
		font-size: 0.95rem;
	}
</style>
