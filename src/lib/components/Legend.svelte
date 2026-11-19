<script lang="ts">
	let { items }: { items: { label: string; color: string }[] } = $props();
</script>

<ul class="legend">
	{#each items as item (item.label)}
		<li><span class="swatch" style:background={item.color}></span>{item.label}</li>
	{/each}
</ul>

<style>
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 1rem;
		list-style: none;
		padding: 0;
		margin: 0 0 0.75rem;
		font-size: 0.85rem;
		color: var(--chart-secondary, #c3c2b7);
	}
	li {
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
