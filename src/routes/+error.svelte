<script lang="ts">
	import { page } from '$app/state';
	import Logo from '#lib/components/Logo.svelte';
</script>

<svelte:head><title>{page.status} · Courtnotes</title></svelte:head>

<main>
	<Logo size={56} />
	<h1>{page.status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
	<p class="muted">{page.error?.message}</p>
	<a class="btn" href="/">Back to Courtnotes</a>
</main>

<style>
	main {
		min-height: 100dvh;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 1rem;
		padding: 2rem;
		text-align: center;
	}
</style>
