<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { app } from '#lib/client/app.svelte.ts';
	import {
		activeShift,
		currentDraft,
		deleteDraft,
		deleteObservation,
		getDraft,
		getObservation,
		getShift,
		newId,
		putDraft,
		putObservation,
		setCurrentJudge,
		type LocalShift
	} from '#lib/client/store.ts';
	import {
		buildRecord,
		elapsed,
		emptyForm,
		formFromRecord,
		startTimer,
		toggleTimer,
		type HearingForm,
		type Timer
	} from '#lib/client/hearing.ts';
	import { courtroomLabel, groupDigits, stopwatch } from '#lib/client/format.ts';
	import { vocab } from '#lib/schema/vocab.ts';
	import type { Observation } from '#lib/schema/types.ts';
	import ChipGroup from '#lib/components/ChipGroup.svelte';
	import ConfirmButton from '#lib/components/ConfirmButton.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { toast } from '#lib/client/toast.svelte.ts';

	const options = {
		hearing: vocab<NonNullable<HearingForm['hearing_type']>>('hearing_type'),
		counsel: vocab<NonNullable<HearingForm['counsel']>>('counsel'),
		release: vocab<NonNullable<HearingForm['release_decision']>>('release_decision'),
		outcome: vocab<NonNullable<HearingForm['outcome']>>('outcome'),
		bailType: vocab<NonNullable<HearingForm['bail_type']>>('bail_type'),
		conditions: vocab<HearingForm['release_conditions'][number]>('release_condition'),
		appearance: vocab<NonNullable<HearingForm['appearance']>>('appearance'),
		interpreter: vocab<NonNullable<HearingForm['interpreter']>>('interpreter'),
		gender: vocab<NonNullable<HearingForm['perceived_gender']>>('perceived_gender'),
		race: vocab<NonNullable<HearingForm['perceived_race_ethnicity']>>('perceived_race_ethnicity'),
		age: vocab<NonNullable<HearingForm['perceived_age_range']>>('perceived_age_range'),
		custody: [
			{ value: 'yes' as const, label: 'In custody' },
			{ value: 'no' as const, label: 'Not in custody' }
		]
	};
	const QUICK_BAIL = [500, 1000, 5000, 10000];

	let ready = $state(false);
	let id = $state('');
	let shift = $state<LocalShift | undefined>();
	let original = $state<Observation | undefined>();
	let form = $state<HearingForm>(emptyForm());
	let timer = $state<Timer>(startTimer());
	let now = $state(Date.now());
	let editingJudge = $state(false);
	let saving = $state(false);
	let missing = $state(false);

	const editing = $derived(Boolean(original));
	const running = $derived(timer.runningSince !== null);
	const shown = $derived(stopwatch(elapsed(timer, now)));
	const judges = $derived(app.settings?.directory.judges ?? []);

	async function openNew(s: LocalShift, draftId?: string | null) {
		const draft = draftId ? await getDraft(draftId) : await currentDraft();
		if (draft && !draft.editing && draft.shiftId === s.id) {
			id = draft.id;
			form = { ...emptyForm(), ...draft.form };
			timer = draft.timer;
		} else {
			id = newId();
			form = emptyForm(s.currentJudge ?? s.record.judge?.name ?? '');
			timer = startTimer();
			await persist();
		}
		original = undefined;
	}

	onMount(() => {
		const tick = setInterval(() => (now = Date.now()), 250);
		void (async () => {
			const editId = page.url.searchParams.get('id');
			if (editId) {
				const saved = await getObservation(editId);
				if (!saved) {
					missing = true;
					ready = true;
					return;
				}
				original = saved.record;
				id = saved.id;
				shift = saved.record.shift_id ? await getShift(saved.record.shift_id) : undefined;
				form = formFromRecord(saved.record);
				timer = {
					firstStartedAt: Date.parse(saved.record.started_at),
					runningSince: null,
					accumulatedMs: (saved.record.duration_seconds ?? 0) * 1000
				};
			} else {
				shift = await activeShift();
				if (!shift) return goto(resolve('/(watcher)/shift/new'), { replaceState: true });
				await openNew(shift, page.url.searchParams.get('draft'));
			}
			ready = true;
		})();
		return () => {
			clearInterval(tick);
			clearTimeout(saveTimer);
		};
	});

	// Persist every change to a new hearing so a crash, reload or dead battery loses nothing.
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	/** Set once the hearing is saved or discarded, so a late autosave can't resurrect it. */
	let closed = false;
	async function persist() {
		if (closed || original || !shift || !id) return;
		await putDraft({
			id,
			shiftId: shift.id,
			editing: false,
			form: $state.snapshot(form),
			timer: $state.snapshot(timer),
			updatedAt: Date.now()
		});
	}
	$effect(() => {
		// Track deep changes to the form and timer.
		JSON.stringify(form);
		JSON.stringify(timer);
		if (!untrack(() => ready)) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void persist(), 250);
	});

	function toggle() {
		timer = toggleTimer(timer);
	}

	function restartTimer() {
		timer = startTimer();
	}

	function addBail(amount: number) {
		const current = Number(form.bail_amount.replace(/\D/g, '') || 0);
		form.bail_amount = groupDigits(String(current + amount));
	}

	function onBailInput(event: Event, key: 'bail_amount' | 'prosecution_request') {
		const input = event.currentTarget as HTMLInputElement;
		form[key] = groupDigits(input.value);
		input.value = form[key];
	}

	async function save(next: boolean) {
		if (!form.hearing_type) {
			toast('Pick the hearing type first.');
			document.getElementById('hearing-type')?.scrollIntoView({ block: 'center' });
			return;
		}
		if (!shift && !original) return;
		saving = true;
		clearTimeout(saveTimer);
		closed = true;
		const settings = app.settings ?? (await app.updateSettings({}));
		const record = buildRecord($state.snapshot(form), {
			id,
			shiftId: shift?.id ?? original?.shift_id ?? '',
			observerId: settings.observerId,
			programId: settings.program?.id ?? 'court-watch',
			court: $state.snapshot(shift?.record.court ?? original!.court),
			timer: $state.snapshot(timer),
			original: original ? $state.snapshot(original) : undefined
		});
		await putObservation(record);
		await deleteDraft(id);
		if (shift && record.judge?.name && record.judge.name !== shift.currentJudge) {
			await setCurrentJudge(shift.id, record.judge.name);
			shift = await getShift(shift.id);
		}
		app.scheduleSync();
		saving = false;
		if (next && shift) {
			toast('Saved. Timer running for the next case.');
			id = newId();
			form = emptyForm(record.judge?.name ?? '');
			timer = startTimer();
			editingJudge = false;
			closed = false;
			await persist();
			window.scrollTo({ top: 0 });
		} else {
			toast(editing ? 'Changes saved.' : 'Hearing saved.');
			await goto(resolve('/(watcher)'));
		}
	}

	async function discard() {
		clearTimeout(saveTimer);
		closed = true;
		if (editing) {
			await deleteObservation(id);
			app.scheduleSync();
			toast('Hearing deleted.');
		} else {
			await deleteDraft(id);
		}
		await goto(resolve('/(watcher)'));
	}
</script>

<svelte:head><title>{editing ? 'Edit hearing' : 'New hearing'} · Courtnotes</title></svelte:head>

{#if missing}
	<div class="stack">
		<p>This hearing is no longer on this device.</p>
		<a class="btn" href="/">Back</a>
	</div>
{:else if ready}
	<div class="bar">
		<a class="btn btn-ghost btn-sm back" href="/" aria-label="Back to shift">
			<Icon name="left" />
		</a>
		<div class="context">
			<strong>{courtroomLabel(shift?.record.court ?? original?.court)}</strong>
			<span class="muted">{editing ? 'Editing saved hearing' : 'New hearing'}</span>
		</div>
		<button
			type="button"
			class="timer"
			class:running
			onclick={toggle}
			aria-label={running
				? `Timer ${shown}, tap to pause`
				: `Timer ${shown}, paused, tap to resume`}
			data-testid="timer"
		>
			<Icon name={running ? 'pause' : 'play'} size={18} strokeWidth={2.6} />
			<span class="mono">{shown}</span>
		</button>
	</div>

	<form class="stack capture" onsubmit={(e) => e.preventDefault()}>
		<div class="judge">
			{#if editingJudge}
				<label class="field grow">
					<span>Judge</span>
					<input
						class="input"
						bind:value={form.judge}
						list="judge-list"
						autocomplete="off"
						placeholder="Judge's name"
					/>
					<datalist id="judge-list">
						{#each judges as j (j)}<option value={j}></option>{/each}
					</datalist>
				</label>
				<button type="button" class="btn btn-sm" onclick={() => (editingJudge = false)}>
					Done
				</button>
			{:else}
				<div class="grow">
					<span class="label">Judge</span>
					<div>{form.judge || 'Not recorded'}</div>
				</div>
				<button type="button" class="btn btn-sm" onclick={() => (editingJudge = true)}>
					Change
				</button>
			{/if}
		</div>

		<div id="hearing-type">
			<ChipGroup label="Hearing type" options={options.hearing} bind:value={form.hearing_type} />
		</div>
		<ChipGroup label="Defense lawyer" options={options.counsel} bind:value={form.counsel} />
		<ChipGroup
			label="Release decision"
			options={options.release}
			bind:value={form.release_decision}
		/>

		{#if form.release_decision === 'bail_set'}
			<section class="bail card stack" aria-label="Bail">
				<label class="field">
					<span>Bail amount</span>
					<div class="money">
						<span aria-hidden="true">$</span>
						<input
							class="input amount mono"
							inputmode="numeric"
							autocomplete="off"
							placeholder="0"
							value={form.bail_amount}
							oninput={(e) => onBailInput(e, 'bail_amount')}
							data-testid="bail-amount"
						/>
					</div>
				</label>
				<div class="quick">
					{#each QUICK_BAIL as amount (amount)}
						<button type="button" class="btn btn-sm" onclick={() => addBail(amount)}>
							+{amount.toLocaleString('en-US')}
						</button>
					{/each}
					<button
						type="button"
						class="btn btn-sm btn-ghost"
						onclick={() => (form.bail_amount = '')}
					>
						Clear
					</button>
				</div>
				<ChipGroup
					label="Bail type"
					options={options.bailType}
					bind:value={form.bail_type}
					columns={3}
				/>
				<label class="field">
					<span>Prosecution asked for (optional)</span>
					<div class="money">
						<span aria-hidden="true">$</span>
						<input
							class="input mono"
							inputmode="numeric"
							autocomplete="off"
							placeholder="—"
							value={form.prosecution_request}
							oninput={(e) => onBailInput(e, 'prosecution_request')}
						/>
					</div>
				</label>
			</section>
		{/if}

		{#if form.release_decision === 'released_conditions' || form.release_decision === 'bail_set'}
			<ChipGroup
				label="Release conditions"
				options={options.conditions}
				bind:values={form.release_conditions}
				multiple
			/>
		{/if}

		<ChipGroup label="Outcome" options={options.outcome} bind:value={form.outcome} />

		<label class="field">
			<span>The judge said</span>
			<textarea
				class="textarea"
				bind:value={form.judge_remarks}
				placeholder="Words from the bench, as close to verbatim as you can"
				maxlength="5000"></textarea>
		</label>
		<label class="field">
			<span>Notes</span>
			<textarea
				class="textarea"
				bind:value={form.notes}
				placeholder="Anything else worth remembering. No defendant names."
				maxlength="5000"></textarea>
		</label>

		<details class="more card">
			<summary>
				<span>More details</span>
				<span class="muted">defendant, interpreter, case number</span>
				<Icon name="down" size={18} />
			</summary>
			<div class="stack">
				<ChipGroup
					label="Defendant appeared"
					options={options.appearance}
					bind:value={form.appearance}
					columns={3}
				/>
				<ChipGroup label="Custody" options={options.custody} bind:value={form.in_custody} />
				<ChipGroup
					label="Interpreter"
					options={options.interpreter}
					bind:value={form.interpreter}
					columns={3}
				/>
				<p class="hint">
					Perceived characteristics are your impression only, used for aggregate analysis. Never ask
					anyone.
				</p>
				<ChipGroup
					label="Perceived gender"
					options={options.gender}
					bind:value={form.perceived_gender}
				/>
				<ChipGroup
					label="Perceived race / ethnicity"
					options={options.race}
					bind:value={form.perceived_race_ethnicity}
				/>
				<ChipGroup
					label="Perceived age"
					options={options.age}
					bind:value={form.perceived_age_range}
					columns={3}
				/>
				<label class="field">
					<span>Case / docket number</span>
					<input
						class="input mono"
						bind:value={form.case_number}
						autocomplete="off"
						maxlength="80"
						placeholder="Only if your program records it"
					/>
				</label>
				{#if !editing}
					<button type="button" class="btn btn-sm btn-ghost" onclick={restartTimer}>
						<Icon name="refresh" size={16} /> Restart timer from now
					</button>
				{/if}
			</div>
		</details>

		<ConfirmButton
			class="btn btn-ghost btn-block"
			confirmLabel={editing ? 'Tap again to delete this hearing' : 'Tap again to discard'}
			onconfirm={discard}
		>
			<Icon name="trash" size={18} />
			{editing ? 'Delete hearing' : 'Discard hearing'}
		</ConfirmButton>
	</form>

	<div class="actions">
		{#if editing}
			<button
				class="btn btn-primary btn-block btn-xl"
				type="button"
				disabled={saving}
				onclick={() => save(false)}
			>
				<Icon name="check" size={24} /> Save changes
			</button>
		{:else}
			<button
				class="btn btn-done"
				type="button"
				disabled={saving}
				onclick={() => save(false)}
				data-testid="save-done"
			>
				Save
			</button>
			<button
				class="btn btn-primary btn-xl grow"
				type="button"
				disabled={saving}
				onclick={() => save(true)}
				data-testid="save-next"
			>
				Save &amp; next case <Icon name="right" size={22} strokeWidth={2.6} />
			</button>
		{/if}
	</div>
{/if}

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: -1rem -1rem 1rem;
		padding: calc(0.5rem + env(safe-area-inset-top)) 1rem 0.5rem 0.5rem;
		background: rgb(12 13 15 / 0.95);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--border);
	}
	.back {
		padding: 0 0.6rem;
	}
	.context {
		flex: 1;
		min-width: 0;
		display: grid;
		line-height: 1.25;
	}
	.context strong,
	.context span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.context span {
		font-size: 0.85rem;
	}
	.timer {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 3.25rem;
		padding: 0 1rem;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: 1.5rem;
		font-weight: 700;
		cursor: pointer;
	}
	.timer.running {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-soft);
	}
	.capture {
		gap: 1.5rem;
	}
	.judge {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		padding: 0.75rem 0.9rem;
		border-radius: var(--radius);
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.bail {
		border-color: var(--accent);
	}
	.money {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--muted);
	}
	.amount {
		font-size: 2rem;
		font-weight: 700;
		min-height: 4.25rem;
	}
	.quick {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.more summary {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 2.5rem;
		cursor: pointer;
		list-style: none;
		font-weight: 700;
	}
	.more summary::-webkit-details-marker {
		display: none;
	}
	.more summary .muted {
		flex: 1;
		font-weight: 400;
		font-size: 0.9rem;
	}
	.more[open] summary {
		margin-bottom: 1rem;
	}
	.more[open] summary :global(svg) {
		transform: rotate(180deg);
	}
	.actions {
		position: sticky;
		bottom: 0;
		z-index: 10;
		display: flex;
		gap: 0.6rem;
		margin: 1.5rem -1rem -2rem;
		padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
		background: rgb(12 13 15 / 0.95);
		backdrop-filter: blur(12px);
		border-top: 1px solid var(--border);
	}
	.btn-done {
		min-height: 5rem;
		min-width: 5.5rem;
		border-radius: 18px;
		font-size: 1.15rem;
	}
</style>
