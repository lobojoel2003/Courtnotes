<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import FilterBar from '#lib/components/FilterBar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { label } from '#lib/schema/vocab.ts';
	import { withParam } from '#lib/url.ts';
	import { formatDuration, formatMoney } from '#lib/stats.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const when = (iso: string) =>
		new Date(iso).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			timeZone: data.program.timeZone
		});

	const pageLink = (n: number) => withParam(page.url.search, 'page', String(n));
</script>

<svelte:head><title>Records · {data.program.name}</title></svelte:head>

<div class="head">
	<div>
		<h1>Records</h1>
		<p class="muted">
			{data.total.toLocaleString('en-US')} hearing{data.total === 1 ? '' : 's'} · {data.description}.
			Exclude test entries or duplicates; they stay in the database but leave every chart, report
			and export.
		</p>
	</div>
	<a class="btn btn-sm" href="/api/export/observations.csv{data.query}" download>
		<Icon name="download" size={16} /> CSV
	</a>
</div>

<FilterBar
	range={data.range}
	ranges={data.ranges}
	from={data.filters.from}
	to={data.filters.to}
	court={data.filters.court}
	judge={data.filters.judge}
	courts={data.options.courts}
	judges={data.options.judges}
/>

<div class="card table">
	<div class="scroll">
		<table>
			<thead>
				<tr>
					<th scope="col">When</th>
					<th scope="col">Court</th>
					<th scope="col">Judge</th>
					<th scope="col">Hearing</th>
					<th scope="col">Lawyer</th>
					<th scope="col">Release</th>
					<th scope="col" class="num">Bail</th>
					<th scope="col">Outcome</th>
					<th scope="col" class="num">Length</th>
					<th scope="col"><span class="visually-hidden">Include</span></th>
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row (row.record.id)}
					{@const r = row.record}
					<tr class:excluded={row.excluded}>
						<td class="nowrap">{when(r.started_at)}</td>
						<td>
							{r.court.name}{#if r.court.courtroom}<span class="muted">
									· {r.court.courtroom}
								</span>{/if}
						</td>
						<td>{r.judge?.name ?? '—'}</td>
						<td>
							{label('hearing_type', r.hearing_type)}
							{#if r.judge_remarks}<div class="quote">“{r.judge_remarks}”</div>{/if}
							{#if r.notes}<div class="note">{r.notes}</div>{/if}
							{#if row.excluded}<div class="note">Excluded: {row.excluded_reason}</div>{/if}
						</td>
						<td>{label('counsel', r.counsel)}</td>
						<td>{label('release_decision', r.release_decision)}</td>
						<td class="num">{r.bail ? formatMoney(r.bail.amount, r.bail.currency) : '—'}</td>
						<td>{label('outcome', r.outcome)}</td>
						<td class="num">{formatDuration(r.duration_seconds)}</td>
						<td>
							<form method="POST" action="?/exclude" use:enhance>
								<input type="hidden" name="id" value={r.id} />
								<input type="hidden" name="exclude" value={String(!row.excluded)} />
								<button class="btn btn-sm btn-ghost" type="submit">
									{row.excluded ? 'Include' : 'Exclude'}
								</button>
							</form>
						</td>
					</tr>
				{:else}
					<tr><td colspan="10" class="muted">No records match these filters.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

{#if data.pages > 1}
	<nav class="pager" aria-label="Pages">
		{#if data.page > 1}<a class="btn btn-sm" href={pageLink(data.page - 1)}>
				<Icon name="left" size={16} /> Newer
			</a>{/if}
		<span class="muted">Page {data.page} of {data.pages}</span>
		{#if data.page < data.pages}<a class="btn btn-sm" href={pageLink(data.page + 1)}>
				Older <Icon name="right" size={16} />
			</a>{/if}
	</nav>
{/if}

<style>
	.head {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.head > div {
		flex: 1;
	}
	h1 {
		font-size: 1.7rem;
	}
	.head p {
		margin: 0.25rem 0 0;
		max-width: 52rem;
	}
	.table {
		margin-top: 1rem;
		padding: 0.25rem 0.5rem;
	}
	.scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	th,
	td {
		padding: 0.6rem 0.65rem;
		text-align: left;
		vertical-align: top;
		border-bottom: 1px solid var(--border);
	}
	thead th {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.nowrap {
		white-space: nowrap;
	}
	.quote,
	.note {
		max-width: 26rem;
		margin-top: 0.25rem;
		font-size: 0.85rem;
		color: var(--text-2);
		white-space: normal;
	}
	.quote {
		font-style: italic;
	}
	tr.excluded td {
		opacity: 0.45;
	}
	tr.excluded td:last-child {
		opacity: 1;
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-top: 1rem;
	}
</style>
