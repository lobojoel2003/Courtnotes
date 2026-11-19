<script lang="ts">
	import type { LocalObservation } from '#lib/client/store.ts';
	import { clock, money } from '#lib/client/format.ts';
	import { label } from '#lib/schema/vocab.ts';
	import { formatDuration } from '#lib/stats.ts';
	import Icon from './Icon.svelte';

	let { hearing }: { hearing: LocalObservation } = $props();
	const r = $derived(hearing.record);

	const release = $derived(
		r.release_decision === 'bail_set' && r.bail
			? `Bail ${money(r.bail.amount, r.bail.currency)}`
			: r.release_decision && r.release_decision !== 'not_addressed'
				? label('release_decision', r.release_decision)
				: r.outcome
					? label('outcome', r.outcome)
					: ''
	);
	const meta = $derived(
		[release, r.duration_seconds !== undefined ? formatDuration(r.duration_seconds) : '']
			.filter(Boolean)
			.join(' · ')
	);
</script>

<a class="row-link" href="/hearing?id={hearing.id}">
	<span class="time mono">{clock(r.started_at)}</span>
	<span class="main">
		<strong>{label('hearing_type', r.hearing_type)}</strong>
		<span class="muted">{meta}</span>
		{#if hearing.sync === 'rejected'}<span class="error">Needs fixing: {hearing.error}</span>{/if}
	</span>
	{#if hearing.sync === 'synced'}
		<span class="state ok"><Icon name="check" size={18} label="Synced" /></span>
	{:else if hearing.sync === 'rejected'}
		<span class="state bad"><Icon name="alert" size={18} label="Rejected by server" /></span>
	{:else}
		<span class="state wait"><Icon name="upload" size={18} label="Waiting to sync" /></span>
	{/if}
</a>

<style>
	.row-link {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		min-height: var(--tap);
		padding: 0.7rem 0.9rem;
		border-radius: var(--radius);
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		text-decoration: none;
	}
	.row-link:hover {
		border-color: var(--border-strong);
	}
	.time {
		color: var(--muted);
		font-size: 0.9rem;
		min-width: 4.6rem;
	}
	.main {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.main .muted {
		font-size: 0.95rem;
	}
	.error {
		color: var(--danger);
		font-size: 0.85rem;
	}
	.state {
		display: flex;
	}
	.ok {
		color: var(--ok);
	}
	.bad {
		color: var(--danger);
	}
	.wait {
		color: var(--accent);
	}
</style>
