<script lang="ts">
	// One whole split into parts: a tall segmented bar with the share printed inside each block
	// that has room, a legend underneath and the full numbers on hover and for screen readers.
	export interface Segment {
		label: string;
		count: number;
		color: string;
		ink: string;
	}

	let { segments, label }: { segments: Segment[]; label: string } = $props();

	const total = $derived(segments.reduce((n, s) => n + s.count, 0));
	const visible = $derived(segments.filter((s) => s.count > 0));
	const pct = (n: number) => `${Math.round((n / Math.max(1, total)) * 100)}%`;
	const summary = $derived(
		`${label}: ` + visible.map((s) => `${s.label} ${pct(s.count)} (${s.count})`).join(', ')
	);
</script>

{#if total}
	<div class="bar" role="img" aria-label={summary}>
		{#each visible as s (s.label)}
			<div
				class="part"
				style:flex-grow={s.count}
				style:background={s.color}
				style:color={s.ink}
				title="{s.label}: {pct(s.count)} ({s.count.toLocaleString('en-US')})"
			>
				{#if s.count / total >= 0.08}<span>{pct(s.count)}</span>{/if}
			</div>
		{/each}
	</div>
	<ul class="legend">
		{#each visible as s (s.label)}
			<li><span class="swatch" style:background={s.color}></span>{s.label}</li>
		{/each}
	</ul>
{:else}
	<p class="muted">No data yet.</p>
{/if}

<style>
	.bar {
		display: flex;
		gap: 2px;
		height: 28px;
	}
	.part {
		flex-basis: 0;
		min-width: 3px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		padding-left: 0.5rem;
		font-size: 0.8rem;
		font-weight: 700;
		overflow: hidden;
		white-space: nowrap;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 1rem;
		list-style: none;
		padding: 0;
		margin: 0.75rem 0 0;
		font-size: 0.85rem;
		color: var(--chart-secondary, #c3c2b7);
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 2px;
	}
</style>
