<script lang="ts" generics="T extends string">
	import type { VocabOption } from '#lib/schema/vocab.ts';

	interface Props {
		label: string;
		options: VocabOption<T>[];
		/** Selected value (single) — tap the selected chip again to clear it. */
		value?: T | undefined;
		/** Selected values (multiple). */
		values?: T[];
		multiple?: boolean;
		columns?: 1 | 2 | 3;
		onchange?: () => void;
	}

	let {
		label,
		options,
		value = $bindable(),
		values = $bindable([]),
		multiple = false,
		columns = 2,
		onchange
	}: Props = $props();

	const id = `chips-${Math.random().toString(36).slice(2, 9)}`;

	function toggle(option: T) {
		if (multiple) {
			values = values.includes(option) ? values.filter((v) => v !== option) : [...values, option];
		} else {
			value = value === option ? undefined : option;
		}
		onchange?.();
	}

	const selected = (option: T) => (multiple ? values.includes(option) : value === option);
</script>

<fieldset class="chips" aria-labelledby={id}>
	<legend class="label" {id}>{label}</legend>
	<div class="grid" style:--columns={columns}>
		{#each options as option (option.value)}
			<button
				type="button"
				class="chip"
				class:on={selected(option.value)}
				aria-pressed={selected(option.value)}
				title={option.description}
				onclick={() => toggle(option.value)}
			>
				{option.label}
			</button>
		{/each}
	</div>
</fieldset>

<style>
	.chips {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 0.55rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
		gap: 0.5rem;
	}
	.chip {
		min-height: var(--tap);
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text);
		font-size: 1.02rem;
		font-weight: 600;
		line-height: 1.2;
		text-align: center;
		cursor: pointer;
		touch-action: manipulation;
		transition:
			background-color 100ms,
			border-color 100ms,
			color 100ms;
	}
	.chip:hover {
		border-color: var(--muted);
	}
	.chip.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
</style>
