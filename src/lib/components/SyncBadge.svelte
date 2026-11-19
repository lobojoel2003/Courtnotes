<script lang="ts">
	import { app } from '#lib/client/app.svelte.ts';
	import { ago } from '#lib/client/format.ts';
	import Icon from './Icon.svelte';

	let now = $state(Date.now());
	$effect(() => {
		const t = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(t);
	});

	const status = $derived.by(() => {
		if (app.syncing) return { tone: '', icon: 'refresh' as const, text: 'Syncing…' };
		if (app.problem) return { tone: 'pill-danger', icon: 'alert' as const, text: 'Sync problem' };
		if (app.rejected)
			return { tone: 'pill-danger', icon: 'alert' as const, text: `${app.rejected} to fix` };
		if (!app.online || !app.reachable) {
			return app.pending
				? { tone: 'pill-warn', icon: 'cloudOff' as const, text: `Offline · ${app.pending} saved` }
				: { tone: '', icon: 'cloudOff' as const, text: 'Offline' };
		}
		if (app.pending)
			return { tone: 'pill-warn', icon: 'upload' as const, text: `${app.pending} waiting` };
		const last = app.settings?.lastSyncAt;
		return {
			tone: 'pill-ok',
			icon: 'check' as const,
			text: last ? `Synced ${ago(last, now)}` : 'Synced'
		};
	});
</script>

<a class="pill {status.tone}" href="/history" aria-live="polite" data-testid="sync-badge">
	<Icon name={status.icon} size={15} strokeWidth={2.4} />
	{status.text}
</a>

<style>
	a {
		text-decoration: none;
		min-height: 2rem;
	}
</style>
