<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import Chart from '#lib/components/Chart.svelte';
	import SegmentedBar from '#lib/components/SegmentedBar.svelte';
	import Legend from '#lib/components/Legend.svelte';
	import FilterBar from '#lib/components/FilterBar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { THEMES, builders, inkOn } from '#lib/charts.ts';
	import { DECIDED, formatDuration, formatHours, formatMoney, formatPercent } from '#lib/stats.ts';
	import { label } from '#lib/schema/vocab.ts';
	import { withParam } from '#lib/url.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const theme = THEMES.dark;
	const charts = builders(theme);

	// Live: refresh every 30 seconds while the tab is visible.
	let now = $state(Date.now());
	let refreshing = $state(false);
	onMount(() => {
		const tick = setInterval(() => (now = Date.now()), 5000);
		const poll = setInterval(() => {
			if (document.visibilityState !== 'visible' || refreshing) return;
			refreshing = true;
			void invalidate('app:dashboard').finally(() => (refreshing = false));
		}, 30_000);
		return () => {
			clearInterval(tick);
			clearInterval(poll);
		};
	});
	const updated = $derived(Math.max(0, Math.round((now - Date.parse(data.generatedAt)) / 1000)));

	const s = $derived(data.summary);
	const counselSegments = $derived(
		data.counsel
			.filter((c) => c.value !== 'unknown')
			.map((c, i) => ({
				label: c.label,
				count: c.count,
				color: theme.series[i % theme.series.length],
				ink: inkOn(theme.series[i % theme.series.length])
			}))
	);
	const releaseLegend = DECIDED.map((d, i) => ({
		label: label('release_decision', d),
		color: theme.series[i]
	}));
	const maxOutcome = $derived(Math.max(1, ...data.outcomes.map((o) => o.count)));
	const exportQuery = (extra: string) => (data.query ? `${data.query}&${extra}` : `?${extra}`);
	const busy = $derived(Boolean(navigating.to) || refreshing);
	const judgeLink = (judge: string) => `/dashboard${withParam(page.url.search, 'judge', judge)}`;
</script>

<svelte:head><title>Overview · {data.program.name}</title></svelte:head>

<div class="head">
	<div>
		<h1>Overview</h1>
		<p class="muted">
			{data.description}{#if data.filters.court}&nbsp;· {data.filters
					.court}{/if}{#if data.filters.judge}&nbsp;· {data.filters.judge}{/if}
		</p>
	</div>
	<span class="live" title="Refreshes every 30 seconds">
		<span class="dot" class:busy aria-hidden="true"></span>
		Live · updated {updated < 10 ? 'just now' : `${updated}s ago`}
	</span>
	<details class="export">
		<summary class="btn btn-sm"><Icon name="download" size={16} /> Export</summary>
		<div class="menu card">
			<a href="/api/export/observations.csv{data.query}" download>Hearings (CSV)</a>
			<a href="/api/export/shifts.csv{data.query}" download>Shifts (CSV)</a>
			<a href="/api/export/observations.json{data.query}" download>
				Full dataset (JSON, open standard)
			</a>
			<hr />
			<a href="/api/export/observations.csv{exportQuery('public=1')}" download>
				Public hearings CSV <small>(no names, case numbers or notes)</small>
			</a>
			<a href="/api/export/observations.json{exportQuery('public=1')}" download>
				Public dataset (JSON)
			</a>
			<hr />
			<a href="/dashboard/report{data.query}">Ready-to-publish report →</a>
		</div>
	</details>
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

{#if !s.hearings}
	<section class="card empty">
		<h2>No hearings in this range yet</h2>
		<p class="muted">
			Volunteers record hearings in the <a href="/">watcher app</a> on their phones, using the program
			access code. Their notes appear here within seconds of reaching signal. Try a wider date range,
			or clear the court and judge filters.
		</p>
		<a class="btn btn-sm" href="/dashboard?range=all">Show all time</a>
	</section>
{:else}
	<div class="content" class:busy>
		<section class="tiles" aria-label="Key figures">
			<div class="tile hero">
				<span class="label">Hearings observed</span>
				<strong>{s.hearings.toLocaleString('en-US')}</strong>
				<span class="muted">
					before {s.judges} judge{s.judges === 1 ? '' : 's'} on {s.days} day{s.days === 1
						? ''
						: 's'}
				</span>
			</div>
			<div class="tile">
				<span class="label">Shifts covered</span>
				<strong>{s.shifts.toLocaleString('en-US')}</strong>
				<span class="muted">
					{formatHours(s.watchedSeconds)} hours · {s.observers} volunteer{s.observers === 1
						? ''
						: 's'}
				</span>
			</div>
			<div class="tile">
				<span class="label">Median hearing</span>
				<strong>{formatDuration(s.medianDurationSeconds)}</strong>
				<span class="muted">from case called to next case</span>
			</div>
			<div class="tile">
				<span class="label">Money bail set</span>
				<strong>{formatPercent(s.bailSetRate)}</strong>
				<span class="muted">of {s.releaseDecided.toLocaleString('en-US')} release decisions</span>
			</div>
			<div class="tile">
				<span class="label">Median bail</span>
				<strong>{formatMoney(s.medianBail)}</strong>
				<span class="muted">{formatMoney(s.totalBail)} set in total</span>
			</div>
			<div class="tile">
				<span class="label">No lawyer</span>
				<strong>{formatPercent(s.unrepresentedRate)}</strong>
				<span class="muted">{s.unrepresented} of {s.counselKnown} defendants</span>
			</div>
		</section>

		<section class="grid">
			<article class="card wide">
				<header>
					<h2>Hearings observed per day</h2>
					<p class="muted">Hover a day for shifts covered</p>
				</header>
				<Chart
					label="Column chart of hearings observed per day"
					data={data.days}
					build={charts.perDay}
				/>
			</article>

			<article class="card">
				<header>
					<h2>Cases per judge</h2>
					<p class="muted">Hearings observed</p>
				</header>
				<Chart
					label="Bar chart of hearings observed per judge"
					data={data.judges}
					build={charts.perJudge}
				/>
			</article>

			<article class="card">
				<header>
					<h2>How long hearings last</h2>
					<p class="muted">Median {formatDuration(s.medianDurationSeconds)}</p>
				</header>
				<Chart
					label="Histogram of hearing lengths in minutes"
					data={data.observations}
					build={charts.length}
				/>
			</article>

			<article class="card wide">
				<header>
					<h2>Release decisions by judge</h2>
					<p class="muted">Share of each judge's release decisions, most money bail first</p>
				</header>
				<Legend items={releaseLegend} />
				<Chart
					label="Stacked bar chart of release decisions by judge"
					data={{ observations: data.observations, judges: data.judges }}
					build={charts.release}
				/>
			</article>

			<article class="card wide">
				<header>
					<h2>Bail amounts by judge</h2>
					<p class="muted">
						Each dot is one money bail; the white line is the judge's median (log scale)
					</p>
				</header>
				<Chart
					label="Dot plot of bail amounts set by each judge"
					data={{ observations: data.observations, judges: data.judges }}
					build={charts.bail}
				/>
			</article>

			<article class="card">
				<header>
					<h2>Defense representation</h2>
					<p class="muted">Excludes hearings where the watcher couldn't tell</p>
				</header>
				<SegmentedBar label="Defense representation" segments={counselSegments} />
			</article>

			<article class="card">
				<header>
					<h2>Outcomes</h2>
					<p class="muted">What happened to the case</p>
				</header>
				<ul class="bars">
					{#each data.outcomes as o (o.value)}
						<li>
							<span class="name">{o.label}</span>
							<span class="track">
								<span class="fill" style:width="{(o.count / maxOutcome) * 100}%"></span>
							</span>
							<span class="value tabular">{o.count.toLocaleString('en-US')}</span>
						</li>
					{/each}
				</ul>
			</article>
		</section>

		<section class="card table-card">
			<header>
				<h2>Judges</h2>
				<p class="muted">The numbers behind the charts</p>
			</header>
			<div class="scroll">
				<table>
					<thead>
						<tr>
							<th scope="col">Judge</th>
							<th scope="col" class="num">Hearings</th>
							<th scope="col" class="num">Release decisions</th>
							<th scope="col" class="num">Money bail</th>
							<th scope="col" class="num">Released ROR</th>
							<th scope="col" class="num">Median bail</th>
							<th scope="col" class="num">Highest bail</th>
							<th scope="col" class="num">No lawyer</th>
							<th scope="col" class="num">Median length</th>
						</tr>
					</thead>
					<tbody>
						{#each data.judges as j (j.judge)}
							<tr>
								<th scope="row"><a href={judgeLink(j.judge)}>{j.judge}</a></th>
								<td class="num">{j.hearings.toLocaleString('en-US')}</td>
								<td class="num">{j.releaseDecided.toLocaleString('en-US')}</td>
								<td class="num">{formatPercent(j.bailSetRate)}</td>
								<td class="num">{formatPercent(j.rorRate)}</td>
								<td class="num">{formatMoney(j.medianBail)}</td>
								<td class="num">{formatMoney(j.maxBail)}</td>
								<td class="num">{formatPercent(j.unrepresentedRate)}</td>
								<td class="num">{formatDuration(j.medianDurationSeconds)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="card table-card">
			<header>
				<h2>Recent shifts</h2>
				<p class="muted">Who was watching, where</p>
			</header>
			<div class="scroll">
				<table>
					<thead>
						<tr>
							<th scope="col">When</th>
							<th scope="col">Court</th>
							<th scope="col">Judge</th>
							<th scope="col">Volunteer</th>
							<th scope="col" class="num">Hearings</th>
						</tr>
					</thead>
					<tbody>
						{#each data.recentShifts as sh (sh.id)}
							<tr>
								<td class="nowrap">
									{new Date(sh.started_at).toLocaleString('en-US', {
										weekday: 'short',
										month: 'short',
										day: 'numeric',
										hour: 'numeric',
										minute: '2-digit',
										timeZone: data.program.timeZone
									})}
									{#if !sh.ended_at}<span class="pill pill-ok">On shift</span>{/if}
								</td>
								<td>
									{sh.court}{#if sh.courtroom}<span class="muted"> · {sh.courtroom}</span>{/if}
								</td>
								<td>{sh.judge ?? '—'}</td>
								<td>{sh.observer}</td>
								<td class="num">{sh.hearings}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>
{/if}

<style>
	.head {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	.head > div {
		flex: 1;
	}
	h1 {
		font-size: 1.7rem;
	}
	.head p {
		margin: 0.25rem 0 0;
	}
	.live {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ok);
	}
	.dot.busy {
		background: var(--accent);
	}
	.export {
		position: relative;
	}
	.export summary {
		list-style: none;
	}
	.export summary::-webkit-details-marker {
		display: none;
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 0.4rem);
		z-index: 20;
		display: grid;
		min-width: 19rem;
		padding: 0.4rem;
		box-shadow: var(--shadow);
	}
	.menu a {
		padding: 0.55rem 0.7rem;
		border-radius: var(--radius-sm);
		color: var(--text);
		text-decoration: none;
		font-size: 0.93rem;
	}
	.menu a:hover {
		background: var(--surface-2);
	}
	.menu small {
		color: var(--muted);
	}
	.menu hr {
		border: 0;
		border-top: 1px solid var(--border);
		margin: 0.3rem 0;
		width: 100%;
	}
	.empty {
		margin-top: 1.5rem;
		display: grid;
		gap: 0.6rem;
		justify-items: start;
	}
	.empty p {
		margin: 0;
		max-width: 42rem;
	}
	.content {
		transition: opacity 150ms;
	}
	.content.busy {
		opacity: 0.6;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11.5rem, 1fr));
		gap: 0.75rem;
		margin: 1.25rem 0;
	}
	.tile {
		display: grid;
		gap: 0.2rem;
		align-content: start;
		padding: 1rem 1.1rem;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.tile strong {
		font-size: 1.9rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.tile .muted {
		font-size: 0.85rem;
	}
	.tile.hero {
		border-color: var(--accent);
		background: linear-gradient(180deg, var(--accent-soft), transparent 70%), var(--surface);
	}
	.tile.hero strong {
		font-size: 3rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}
	.wide {
		grid-column: 1 / -1;
	}
	article header,
	.table-card header {
		margin-bottom: 0.9rem;
	}
	h2 {
		font-size: 1.05rem;
	}
	article header p,
	.table-card header p {
		margin: 0.2rem 0 0;
		font-size: 0.85rem;
	}
	.bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.55rem;
	}
	.bars li {
		display: grid;
		grid-template-columns: 9rem 1fr 3rem;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.9rem;
	}
	.track {
		height: 14px;
	}
	.fill {
		display: block;
		height: 100%;
		min-width: 2px;
		background: #3987e5;
		border-radius: 0 4px 4px 0;
	}
	.value {
		text-align: right;
		color: var(--text);
		font-weight: 600;
	}
	.table-card {
		margin-top: 0.75rem;
	}
	.scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.92rem;
	}
	th,
	td {
		padding: 0.6rem 0.75rem;
		text-align: left;
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}
	thead th {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		font-weight: 700;
	}
	tbody th {
		font-weight: 600;
	}
	tbody th a {
		color: var(--text);
		text-decoration: none;
	}
	tbody th a:hover {
		color: var(--accent);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.nowrap {
		white-space: nowrap;
	}
	@media (max-width: 860px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
