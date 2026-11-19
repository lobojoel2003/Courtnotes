<script lang="ts">
	interface Props {
		range: string;
		ranges: readonly { value: string; label: string }[];
		from?: string;
		to?: string;
		court?: string;
		judge?: string;
		courts: string[];
		judges: string[];
	}
	let { range, ranges, from, to, court, judge, courts, judges }: Props = $props();

	let form: HTMLFormElement;
	let selected = $derived(range);
	const submit = () => form.requestSubmit();
</script>

<!-- Plain GET form: filters live in the URL, so every view and export can be bookmarked. -->
<form
	class="filters"
	method="GET"
	bind:this={form}
	data-sveltekit-keepfocus
	data-sveltekit-noscroll
>
	<label>
		<span class="visually-hidden">Date range</span>
		<select
			class="select"
			name="range"
			bind:value={selected}
			onchange={() => selected !== 'custom' && submit()}
		>
			{#each ranges as r (r.value)}<option value={r.value}>{r.label}</option>{/each}
		</select>
	</label>
	{#if selected === 'custom'}
		<label>
			<span class="visually-hidden">From</span><input
				class="input"
				type="date"
				name="from"
				value={from ?? ''}
				onchange={submit}
			/>
		</label>
		<label>
			<span class="visually-hidden">To</span><input
				class="input"
				type="date"
				name="to"
				value={to ?? ''}
				onchange={submit}
			/>
		</label>
	{/if}
	<label>
		<span class="visually-hidden">Court</span>
		<select class="select" name="court" value={court ?? ''} onchange={submit}>
			<option value="">All courts</option>
			{#each courts as c (c)}<option value={c}>{c}</option>{/each}
		</select>
	</label>
	<label>
		<span class="visually-hidden">Judge</span>
		<select class="select" name="judge" value={judge ?? ''} onchange={submit}>
			<option value="">All judges</option>
			{#each judges as j (j)}<option value={j}>{j}</option>{/each}
		</select>
	</label>
	<noscript><button class="btn btn-sm" type="submit">Apply</button></noscript>
</form>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.select,
	.input {
		min-height: 2.6rem;
		padding: 0.4rem 0.8rem;
		font-size: 0.95rem;
		border-radius: var(--radius-sm);
		width: auto;
		max-width: 16rem;
	}
</style>
