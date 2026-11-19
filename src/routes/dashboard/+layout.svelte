<script lang="ts">
	import { page } from '$app/state';
	import Logo from '#lib/components/Logo.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const nav = [
		{ href: '/dashboard', label: 'Overview', icon: 'chart' as const },
		{ href: '/dashboard/records', label: 'Records', icon: 'history' as const },
		{ href: '/dashboard/report', label: 'Report', icon: 'printer' as const }
	];
	const isReport = $derived(page.url.pathname.startsWith('/dashboard/report'));
	const current = (href: string) =>
		href === '/dashboard' ? page.url.pathname === href : page.url.pathname.startsWith(href);
	// Keep the active filters when switching views.
	const keep = $derived(page.url.search);
</script>

{#if isReport}
	{@render children()}
{:else}
	<div class="shell">
		<header>
			<a class="brand" href="/dashboard">
				<Logo size={32} />
				<span>
					<strong>{data.program.name}</strong>
					<small>Courtnotes dashboard</small>
				</span>
			</a>
			<nav aria-label="Dashboard">
				{#each nav as item (item.href)}
					<a href="{item.href}{keep}" aria-current={current(item.href) ? 'page' : undefined}>
						<Icon name={item.icon} size={18} />
						{item.label}
					</a>
				{/each}
			</nav>
			<div class="me">
				<span class="muted">{data.coordinator?.name}</span>
				<form method="POST" action="/logout">
					<button class="btn btn-sm btn-ghost" type="submit" title="Sign out">
						<Icon name="logout" size={18} label="Sign out" />
					</button>
				</form>
			</div>
		</header>

		{#if !data.syncEnabled}
			<p class="banner">
				<Icon name="alert" size={18} /> Volunteers can't sync yet: set
				<code>WATCHER_ACCESS_CODE</code> on the server.
			</p>
		{/if}

		<main>{@render children()}</main>

		<footer>
			<span>Courtnotes {data.version}</span>
			<span>·</span>
			<a
				href="https://github.com/lobojoel2003/Courtnotes/tree/main/schema"
				rel="noopener"
				target="_blank"
			>
				Open data standard (CC0)
			</a>
			<span>·</span>
			<span>Times in {data.program.timeZone}</span>
		</footer>
	</div>
{/if}

<style>
	.shell {
		--chart-surface: var(--surface);
		--chart-text: var(--text);
		--chart-secondary: var(--text-2);
		min-height: 100dvh;
		display: grid;
		grid-template-rows: auto auto 1fr auto;
	}
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0.75rem clamp(1rem, 3vw, 2rem);
		background: rgb(12 13 15 / 0.94);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--border);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		color: var(--text);
		text-decoration: none;
	}
	.brand span {
		display: grid;
		line-height: 1.15;
	}
	.brand small {
		color: var(--muted);
		font-size: 0.78rem;
	}
	nav {
		display: flex;
		gap: 0.25rem;
		flex: 1;
	}
	nav a {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.5rem 0.85rem;
		border-radius: var(--radius-sm);
		color: var(--text-2);
		text-decoration: none;
		font-weight: 600;
		font-size: 0.95rem;
	}
	nav a:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	nav a[aria-current='page'] {
		background: var(--surface-2);
		color: var(--accent);
	}
	.me {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.9rem;
	}
	.banner {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin: 0;
		padding: 0.6rem clamp(1rem, 3vw, 2rem);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 0.92rem;
	}
	code {
		font-family: var(--mono);
	}
	main {
		width: 100%;
		max-width: 88rem;
		margin: 0 auto;
		padding: 1.5rem clamp(1rem, 3vw, 2rem) 3rem;
	}
	footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
		padding: 1.25rem;
		border-top: 1px solid var(--border);
		color: var(--muted);
		font-size: 0.82rem;
	}
	footer a {
		color: var(--text-2);
	}
	@media (max-width: 760px) {
		header {
			flex-wrap: wrap;
			gap: 0.75rem;
		}
		nav {
			order: 3;
			flex-basis: 100%;
			overflow-x: auto;
		}
		.me .muted {
			display: none;
		}
	}
</style>
