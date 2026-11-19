<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { app } from '#lib/client/app.svelte.ts';
	import { activeShift, listShifts, newId, putShift } from '#lib/client/store.ts';
	import { SCHEMA_VERSION, type Shift } from '#lib/schema/types.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { courtroomLabel } from '#lib/client/format.ts';

	let court = $state('');
	let courtroom = $state('');
	let judge = $state('');
	let error = $state<string | null>(null);
	let saving = $state(false);
	let history = $state<Shift[]>([]);

	onMount(async () => {
		if (await activeShift()) return goto(resolve('/(watcher)'), { replaceState: true });
		history = (await listShifts()).map((s) => s.record);
	});

	const directory = $derived(app.settings?.directory ?? { courts: [], judges: [] });

	const unique = (values: (string | undefined)[]) =>
		[...new Set(values.filter((v): v is string => Boolean(v?.trim())))].sort((a, b) =>
			a.localeCompare(b)
		);

	const courts = $derived(
		unique([...history.map((s) => s.court.name), ...directory.courts.map((c) => c.name)])
	);
	const courtrooms = $derived(
		unique([
			...history.filter((s) => s.court.name === court).map((s) => s.court.courtroom),
			...(directory.courts.find((c) => c.name === court)?.courtrooms ?? [])
		])
	);
	const judges = $derived(unique([...history.map((s) => s.judge?.name), ...directory.judges]));

	/** The last few distinct places this volunteer watched, for one-tap starts. */
	const recentPlaces = $derived.by(() => {
		const seen: string[] = [];
		const places: { court: string; courtroom: string; judge: string }[] = [];
		for (const s of history) {
			const p = {
				court: s.court.name,
				courtroom: s.court.courtroom ?? '',
				judge: s.judge?.name ?? ''
			};
			const key = `${p.court}|${p.courtroom}|${p.judge}`;
			if (seen.includes(key)) continue;
			seen.push(key);
			places.push(p);
			if (places.length === 3) break;
		}
		return places;
	});

	async function start(event?: SubmitEvent) {
		event?.preventDefault();
		error = null;
		if (!court.trim()) return (error = 'Which court are you in?');
		saving = true;
		const now = new Date().toISOString();
		const settings = app.settings ?? (await app.updateSettings({}));
		const shift: Shift = {
			schema_version: SCHEMA_VERSION,
			id: newId(),
			program: { id: settings.program?.id ?? 'court-watch' },
			observer: { id: settings.observerId },
			court: { name: court.trim(), ...(courtroom.trim() ? { courtroom: courtroom.trim() } : {}) },
			...(judge.trim() ? { judge: { name: judge.trim() } } : {}),
			started_at: now,
			updated_at: now
		};
		await putShift(shift, { currentJudge: judge.trim() || undefined });
		app.scheduleSync();
		await goto(resolve('/(watcher)'), { replaceState: true });
	}

	function use(place: { court: string; courtroom: string; judge: string }) {
		court = place.court;
		courtroom = place.courtroom;
		judge = place.judge;
	}
</script>

<svelte:head><title>Start a shift · Courtnotes</title></svelte:head>

<div class="top">
	<a class="btn btn-ghost btn-sm" href="/"><Icon name="left" size={18} /> Back</a>
</div>

<form class="stack" onsubmit={start} novalidate>
	<h1>Start a shift</h1>

	{#if recentPlaces.length}
		<div class="stack">
			<span class="label">Same place as before?</span>
			{#each recentPlaces as place (place.court + place.courtroom + place.judge)}
				<button type="button" class="place" onclick={() => use(place)}>
					<strong>{place.court}</strong>
					<span class="muted">
						{[
							place.courtroom && courtroomLabel({ name: place.court, courtroom: place.courtroom }),
							place.judge
						]
							.filter(Boolean)
							.join(' · ')}
					</span>
				</button>
			{/each}
		</div>
	{/if}

	<label class="field">
		<span>Court</span>
		<input
			class="input"
			bind:value={court}
			list="courts"
			placeholder="Courthouse name"
			autocomplete="off"
			required
		/>
		<datalist id="courts">
			{#each courts as c (c)}<option value={c}></option>{/each}
		</datalist>
	</label>
	<label class="field">
		<span>Courtroom</span>
		<input
			class="input"
			bind:value={courtroom}
			list="courtrooms"
			placeholder="e.g. 1101 or Arraignment B"
			autocomplete="off"
		/>
		<datalist id="courtrooms">
			{#each courtrooms as c (c)}<option value={c}></option>{/each}
		</datalist>
	</label>
	<label class="field">
		<span>Judge on the bench</span>
		<input
			class="input"
			bind:value={judge}
			list="judges"
			placeholder="As announced or on the door"
			autocomplete="off"
		/>
		<datalist id="judges">
			{#each judges as j (j)}<option value={j}></option>{/each}
		</datalist>
		<p class="hint">Pick a name from the list when you can, so everyone's notes match.</p>
	</label>

	{#if error}<p class="error" role="alert">{error}</p>{/if}

	<button class="btn btn-primary btn-xl btn-block" type="submit" disabled={saving}>
		<Icon name="play" size={22} /> Start shift
	</button>
</form>

<style>
	.top {
		margin: -0.25rem 0 0.5rem -0.6rem;
	}
	h1 {
		font-size: 1.6rem;
	}
	.place {
		display: grid;
		gap: 0.1rem;
		text-align: left;
		padding: 0.8rem 1rem;
		min-height: var(--tap);
		border-radius: var(--radius);
		border: 1px dashed var(--border-strong);
		background: transparent;
		cursor: pointer;
	}
	.place:hover {
		border-color: var(--accent);
	}
	.error {
		color: var(--danger);
		margin: 0;
	}
</style>
