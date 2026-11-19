<script lang="ts">
	import { onMount } from 'svelte';
	import { app } from '#lib/client/app.svelte.ts';
	import {
		activeShift,
		currentDraft,
		listObservations,
		listShifts,
		putShift,
		type Draft,
		type LocalObservation,
		type LocalShift
	} from '#lib/client/store.ts';
	import { clock, courtroomLabel, shortDate, span, stopwatch } from '#lib/client/format.ts';
	import { elapsed } from '#lib/client/hearing.ts';
	import Icon from '#lib/components/Icon.svelte';
	import HearingRow from '#lib/components/HearingRow.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { toast } from '#lib/client/toast.svelte.ts';

	let shift = $state<LocalShift | undefined>();
	let hearings = $state<LocalObservation[]>([]);
	let draft = $state<Draft | undefined>();
	let recent = $state<LocalShift[]>([]);
	let loaded = $state(false);
	let now = $state(Date.now());

	async function load() {
		shift = await activeShift();
		hearings = shift ? await listObservations(shift.id) : [];
		draft = await currentDraft();
		if (draft && draft.shiftId !== shift?.id) draft = undefined;
		recent = (await listShifts()).filter((s) => s.record.ended_at).slice(0, 3);
		loaded = true;
	}

	onMount(() => {
		void load();
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});

	// Re-read sync states after each sync.
	$effect(() => {
		void app.pending;
		void app.rejected;
		if (loaded) void load();
	});

	async function endShift() {
		if (!shift) return;
		const ended = new Date().toISOString();
		// Snapshot: IndexedDB can't store Svelte's reactive proxies.
		await putShift({ ...$state.snapshot(shift.record), ended_at: ended, updated_at: ended });
		app.scheduleSync(300);
		toast('Shift ended. Thank you for watching.');
		await load();
	}

	const draftElapsed = $derived(draft ? elapsed(draft.timer, now) : 0);
</script>

<svelte:head><title>Shift · Courtnotes</title></svelte:head>

{#if !loaded}
	<p class="muted">Loading…</p>
{:else if shift}
	<section class="stack">
		{#if draft}
			<a class="resume" href="/hearing?draft={draft.id}">
				<span class="dot" aria-hidden="true"></span>
				<span class="grow">Hearing in progress</span>
				<span class="mono">{stopwatch(draftElapsed)}</span>
				<Icon name="right" />
			</a>
		{/if}

		<div class="card shift">
			<p class="label">
				On shift · since {clock(shift.record.started_at)} ({span(
					now - Date.parse(shift.record.started_at)
				)})
			</p>
			<h1>{shift.record.court.name}</h1>
			<p class="where">
				{#if shift.record.court.courtroom}<span>{courtroomLabel(shift.record.court)}</span>{/if}
				<span class="judge">
					<Icon name="gavel" size={16} />
					{shift.currentJudge ?? shift.record.judge?.name ?? 'Judge not set'}
				</span>
			</p>
			<p class="count">
				<strong class="tabular">{hearings.length}</strong> hearing{hearings.length === 1 ? '' : 's'} recorded
			</p>
		</div>

		<a class="btn btn-primary btn-xl btn-block" href="/hearing" data-testid="new-hearing">
			<Icon name="plus" size={28} strokeWidth={2.6} /> New hearing
		</a>

		{#if hearings.length}
			<h2 class="label">This shift</h2>
			<ul class="list">
				{#each hearings as h (h.id)}
					<li><HearingRow hearing={h} /></li>
				{/each}
			</ul>
		{/if}

		<ConfirmButton
			class="btn btn-ghost btn-block"
			confirmLabel="Tap again to end the shift"
			onconfirm={endShift}
		>
			End shift
		</ConfirmButton>
	</section>
{:else}
	<section class="stack">
		<div class="empty">
			<h1>Ready when court is.</h1>
			<p class="muted">
				Start a shift when you sit down in the courtroom. Each hearing gets a timer, and everything
				is saved on this phone until it syncs.
			</p>
		</div>
		<a class="btn btn-primary btn-xl btn-block" href="/shift/new" data-testid="start-shift">
			<Icon name="play" size={22} /> Start a shift
		</a>

		{#if recent.length}
			<h2 class="label">Recent shifts</h2>
			<ul class="list">
				{#each recent as s (s.id)}
					<li class="card recent">
						<div class="grow">
							<strong>{s.record.court.name}</strong>
							<span class="muted">
								{shortDate(s.record.started_at)}{#if s.record.court.courtroom}&nbsp;· {courtroomLabel(
										s.record.court
									)}{/if}
							</span>
						</div>
						{#if s.sync === 'synced'}
							<span class="pill pill-ok"><Icon name="check" size={14} /> Synced</span>
						{:else}
							<span class="pill pill-warn">Waiting</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	h1 {
		font-size: 1.45rem;
	}
	.shift {
		display: grid;
		gap: 0.35rem;
	}
	.where {
		display: grid;
		gap: 0.15rem;
		margin: 0;
		color: var(--text-2);
	}
	.judge {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.judge :global(svg) {
		color: var(--muted);
	}
	.count {
		margin: 0.35rem 0 0;
		color: var(--text-2);
	}
	.count strong {
		color: var(--text);
		font-size: 1.15rem;
	}
	.resume {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: var(--tap);
		padding: 0 1rem;
		border-radius: var(--radius);
		background: var(--accent-soft);
		border: 1px solid var(--accent);
		color: var(--accent);
		font-weight: 700;
		text-decoration: none;
	}
	.dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--accent);
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.empty {
		display: grid;
		gap: 0.5rem;
		padding: 1.5rem 0 0.5rem;
	}
	.empty h1 {
		font-size: 1.8rem;
	}
	.empty p {
		margin: 0;
	}
	.recent {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.85rem 1rem;
	}
</style>
