<script lang="ts">
	import { toastState } from '#lib/client/toast.svelte.ts';
</script>

<div class="toast" role="status" aria-live="polite">
	{#if toastState.message}<span>{toastState.message}</span>{/if}
</div>

<style>
	.toast {
		position: fixed;
		left: 0;
		right: 0;
		bottom: calc(5rem + env(safe-area-inset-bottom));
		z-index: 40;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}
	span {
		background: var(--surface-3);
		border: 1px solid var(--border-strong);
		color: var(--text);
		padding: 0.7rem 1.1rem;
		border-radius: 999px;
		font-weight: 600;
		box-shadow: var(--shadow);
	}
</style>
