<script lang="ts">
	import type { Snippet } from 'svelte';

	// Two-tap confirmation: no modal dialog, no noise. The second tap must come within 4 seconds.
	let {
		onconfirm,
		confirmLabel = 'Tap again to confirm',
		class: className = 'btn btn-danger',
		children
	}: { onconfirm: () => void; confirmLabel?: string; class?: string; children: Snippet } = $props();

	let armed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function click() {
		if (armed) {
			clearTimeout(timer);
			armed = false;
			onconfirm();
			return;
		}
		armed = true;
		timer = setTimeout(() => (armed = false), 4000);
	}

	$effect(() => () => clearTimeout(timer));
</script>

<button type="button" class={className} class:armed onclick={click} aria-live="polite">
	{#if armed}{confirmLabel}{:else}{@render children()}{/if}
</button>

<style>
	.armed {
		background: var(--danger) !important;
		color: #1b0a08 !important;
		border-color: var(--danger) !important;
	}
</style>
