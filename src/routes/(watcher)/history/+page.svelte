<script lang="ts">
	import { onMount } from 'svelte';
	import { app } from '#lib/client/app.svelte.ts';
	import {
		deleteShift,
		exportDevice,
		listObservations,
		listShifts,
		type LocalObservation,
		type LocalShift
	} from '#lib/client/store.ts';
	import { ago, clock, courtroomLabel, shortDate, span } from '#lib/client/format.ts';
	import Icon from '#lib/components/Icon.svelte';
	import HearingRow from '#lib/components/HearingRow.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import { toast } from '#lib/client/toast.svelte.ts';

	let shifts = $state<LocalShift[]>([]);
	let hearings = $state<Record<string, LocalObservation[]>>({});
	let open = $state<string | null>(null);
	let loaded = $state(false);

	async function load() {
		shifts = await listShifts();
		const all = await listObservations();
		const grouped: Record<string, LocalObservation[]> = {};
		for (const h of all) (grouped[h.record.shift_id ?? ''] ??= []).push(h);
		hearings = grouped;
		loaded = true;
	}

	onMount(() => void load());
	$effect(() => {
		void app.pending;
		void app.rejected;
		if (loaded) void load();
	});

	const totalHearings = $derived(Object.values(hearings).reduce((n, list) => n + list.length, 0));

	function shiftState(s: LocalShift) {
		const list = hearings[s.id] ?? [];
		if (s.sync === 'rejected' || list.some((h) => h.sync === 'rejected')) return 'rejected';
		if (s.sync === 'pending' || list.some((h) => h.sync === 'pending')) return 'pending';
		return 'synced';
	}

	async function download() {
		const data = await exportDevice();
		const blob = new Blob(
			[JSON.stringify({ courtnotes_device_export: '1.0.0', ...data }, null, 2)],
			{
				type: 'application/json'
			}
		);
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `courtnotes-device-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	async function remove(id: string) {
		await deleteShift(id);
		app.scheduleSync();
		toast('Shift deleted.');
		await load();
	}
</script>

<svelte:head><title>History · Courtnotes</title></svelte:head>

<section class="stack">
	<h1>History</h1>

	<div class="card status">
		<div class="grow">
			{#if app.problem}
				<strong class="danger">{app.problem}</strong>
			{:else if app.pending}
				<strong>{app.pending} record{app.pending === 1 ? '' : 's'} waiting to sync</strong>
			{:else}
				<strong>Everything is synced</strong>
			{/if}
			<span class="muted">
				{shifts.length} shift{shifts.length === 1 ? '' : 's'} · {totalHearings} hearing{totalHearings ===
				1
					? ''
					: 's'} on this phone
				{#if app.settings?.lastSyncAt}· last sync {ago(app.settings.lastSyncAt)}{/if}
			</span>
		</div>
		<button
			class="btn btn-sm"
			type="button"
			onclick={() => app.syncNow()}
			disabled={app.syncing || !app.online}
		>
			<Icon name="refresh" size={16} />
			{app.syncing ? 'Syncing…' : 'Sync now'}
		</button>
	</div>

	{#if loaded && !shifts.length}
		<p class="muted">No shifts yet. They'll appear here once you start one.</p>
	{/if}

	<ul class="shifts">
		{#each shifts as s (s.id)}
			{@const list = hearings[s.id] ?? []}
			{@const state = shiftState(s)}
			<li class="card shift">
				<button
					type="button"
					class="head"
					aria-expanded={open === s.id}
					onclick={() => (open = open === s.id ? null : s.id)}
				>
					<span class="grow">
						<strong>{shortDate(s.record.started_at)} · {s.record.court.name}</strong>
						<span class="muted">
							{clock(s.record.started_at)}{#if s.record.ended_at}–{clock(s.record.ended_at)} ({span(
									Date.parse(s.record.ended_at) - Date.parse(s.record.started_at)
								)}){:else}
								· on shift now{/if}
							· {list.length} hearing{list.length === 1 ? '' : 's'}
						</span>
					</span>
					{#if state === 'synced'}
						<span class="pill pill-ok"><Icon name="check" size={14} /> Synced</span>
					{:else if state === 'rejected'}
						<span class="pill pill-danger"><Icon name="alert" size={14} /> Fix</span>
					{:else}
						<span class="pill pill-warn">Waiting</span>
					{/if}
				</button>
				{#if open === s.id}
					<div class="body stack">
						<p class="muted where">
							{[s.record.court.courtroom && courtroomLabel(s.record.court), s.record.judge?.name]
								.filter(Boolean)
								.join(' · ')}
						</p>
						{#if s.sync === 'rejected'}<p class="danger">Server said: {s.error}</p>{/if}
						{#each list as h (h.id)}
							<HearingRow hearing={h} />
						{/each}
						<ConfirmButton
							class="btn btn-sm btn-ghost"
							confirmLabel="Tap again to delete this shift and its hearings"
							onconfirm={() => remove(s.id)}
						>
							<Icon name="trash" size={16} /> Delete shift
						</ConfirmButton>
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	{#if shifts.length}
		<button class="btn btn-block" type="button" onclick={download}>
			<Icon name="download" size={18} /> Download my data (JSON)
		</button>
		<p class="hint">
			A backup in the open Courtnotes data format, straight from this phone. It contains everything
			you recorded, so store it somewhere safe.
		</p>
	{/if}
</section>

<style>
	h1 {
		font-size: 1.6rem;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.danger {
		color: var(--danger);
	}
	.shifts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.6rem;
	}
	.shift {
		padding: 0;
		overflow: hidden;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		min-height: var(--tap);
		padding: 0.85rem 1rem;
		border: 0;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}
	.head .muted {
		font-size: 0.92rem;
	}
	.body {
		padding: 0 0.75rem 0.85rem;
	}
	.where {
		margin: 0 0.25rem;
	}
</style>
