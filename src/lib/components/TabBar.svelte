<script lang="ts">
	import { page } from '$app/state';
	import Icon, { type IconName } from './Icon.svelte';

	const tabs: { href: '/' | '/history' | '/settings'; label: string; icon: IconName }[] = [
		{ href: '/', label: 'Shift', icon: 'home' },
		{ href: '/history', label: 'History', icon: 'history' },
		{ href: '/settings', label: 'Settings', icon: 'settings' }
	];
</script>

<nav aria-label="Main">
	{#each tabs as tab (tab.href)}
		<a href={tab.href} aria-current={page.url.pathname === tab.href ? 'page' : undefined}>
			<Icon name={tab.icon} size={24} />
			<span>{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	nav {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 20;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding-bottom: env(safe-area-inset-bottom);
		background: rgb(12 13 15 / 0.94);
		backdrop-filter: blur(12px);
		border-top: 1px solid var(--border);
	}
	a {
		display: grid;
		justify-items: center;
		gap: 0.15rem;
		padding: 0.6rem 0 0.55rem;
		min-height: 3.75rem;
		color: var(--muted);
		text-decoration: none;
		font-size: 0.78rem;
		font-weight: 600;
	}
	a[aria-current='page'] {
		color: var(--accent);
	}
</style>
