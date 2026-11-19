<script lang="ts">
	import Chart from '#lib/components/Chart.svelte';
	import SegmentedBar from '#lib/components/SegmentedBar.svelte';
	import Legend from '#lib/components/Legend.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { THEMES, builders, inkOn } from '#lib/charts.ts';
	import {
		DECIDED,
		formatDuration,
		formatHours,
		formatMoney,
		formatPercent,
		UNKNOWN_JUDGE
	} from '#lib/stats.ts';
	import { label } from '#lib/schema/vocab.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const theme = THEMES.light;
	const charts = builders(theme);
	const s = $derived(data.summary);
	const prepared = $derived(
		new Date(data.generatedAt).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	);
	const period = $derived(
		s.firstDay && s.lastDay
			? `${new Date(`${s.firstDay}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} – ${new Date(`${s.lastDay}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`
			: data.description
	);
	const counselSegments = $derived(
		data.counsel
			.filter((c) => c.value !== 'unknown')
			.map((c, i) => ({
				label: c.label,
				count: c.count,
				color: theme.series[i],
				ink: inkOn(theme.series[i])
			}))
	);
	const releaseLegend = DECIDED.map((d, i) => ({
		label: label('release_decision', d),
		color: theme.series[i]
	}));
	const namedJudges = $derived(data.judges.filter((j) => j.judge !== UNKNOWN_JUDGE));
</script>

<svelte:head><title>Court watch report · {data.program.name}</title></svelte:head>

<div class="report-page">
	<div class="toolbar no-print">
		<a class="tool" href="/dashboard{data.query}"><Icon name="left" size={16} /> Dashboard</a>
		<span class="spacer"></span>
		<a
			class="tool"
			href="/api/export/observations.csv{data.query ? `${data.query}&public=1` : '?public=1'}"
			download
		>
			<Icon name="download" size={16} /> Public data (CSV)
		</a>
		<button class="tool primary" type="button" onclick={() => window.print()}>
			<Icon name="printer" size={16} /> Print / save as PDF
		</button>
	</div>

	<article class="report">
		<header class="masthead">
			<div class="brand"><Logo size={36} /><span>{data.program.name}</span></div>
			<h1>What we saw in court</h1>
			<p class="dek">A court watch report covering {period}.</p>
			<p class="meta">
				Prepared {prepared} from {s.hearings.toLocaleString('en-US')} hearings recorded by
				{s.observers} volunteer court watcher{s.observers === 1 ? '' : 's'}.
			</p>
		</header>

		{#if !s.hearings}
			<p>No hearings were recorded in this period.</p>
		{:else}
			<section>
				<h2>Key findings</h2>
				<ul class="findings">
					{#each data.findings as finding, i (i)}<li>{finding}</li>{/each}
				</ul>
			</section>

			<section class="figures" aria-label="Key figures">
				<div>
					<strong>{s.hearings.toLocaleString('en-US')}</strong><span>hearings observed</span>
				</div>
				<div>
					<strong>{formatHours(s.watchedSeconds)}</strong><span>hours of court watched</span>
				</div>
				<div>
					<strong>{formatDuration(s.medianDurationSeconds)}</strong><span>
						median hearing length
					</span>
				</div>
				<div>
					<strong>{formatPercent(s.bailSetRate)}</strong><span>
						of release decisions set money bail
					</span>
				</div>
				<div><strong>{formatMoney(s.medianBail)}</strong><span>median bail</span></div>
				<div>
					<strong>{formatPercent(s.unrepresentedRate)}</strong><span>
						of defendants had no lawyer
					</span>
				</div>
			</section>

			<section class="avoid-break">
				<h2>Release decisions by judge</h2>
				<p class="caption">
					Share of each judge’s pretrial release decisions. Judges who set money bail most often are
					listed first.
				</p>
				<Legend items={releaseLegend} />
				<Chart
					label="Stacked bar chart of release decisions by judge"
					data={{ observations: data.observations, judges: data.judges }}
					build={charts.release}
				/>
			</section>

			<section class="avoid-break">
				<h2>Bail amounts by judge</h2>
				<p class="caption">
					Each dot is one money bail. The dark line marks each judge’s median. Log scale.
				</p>
				<Chart
					label="Dot plot of bail amounts by judge"
					data={{ observations: data.observations, judges: data.judges }}
					build={charts.bail}
				/>
			</section>

			<div class="two">
				<section class="avoid-break">
					<h2>How long hearings last</h2>
					<p class="caption">Minutes from when a case was called to when it ended.</p>
					<Chart
						label="Histogram of hearing lengths"
						data={data.observations}
						build={charts.length}
					/>
				</section>
				<section class="avoid-break">
					<h2>Who represented defendants</h2>
					<p class="caption">Excludes hearings where the watcher could not tell.</p>
					<SegmentedBar label="Defense representation" segments={counselSegments} />
				</section>
			</div>

			<section class="avoid-break">
				<h2>Court coverage</h2>
				<p class="caption">Hearings observed per day.</p>
				<Chart
					label="Column chart of hearings observed per day"
					data={data.days}
					build={charts.perDay}
				/>
			</section>

			<section>
				<h2>Judge by judge</h2>
				<table>
					<thead>
						<tr>
							<th scope="col">Judge</th>
							<th scope="col" class="num">Hearings</th>
							<th scope="col" class="num">Money bail</th>
							<th scope="col" class="num">Released ROR</th>
							<th scope="col" class="num">Median bail</th>
							<th scope="col" class="num">No lawyer</th>
							<th scope="col" class="num">Median length</th>
						</tr>
					</thead>
					<tbody>
						{#each namedJudges as j (j.judge)}
							<tr>
								<th scope="row">{j.judge}</th>
								<td class="num">{j.hearings.toLocaleString('en-US')}</td>
								<td class="num">{formatPercent(j.bailSetRate)}</td>
								<td class="num">{formatPercent(j.rorRate)}</td>
								<td class="num">{formatMoney(j.medianBail)}</td>
								<td class="num">{formatPercent(j.unrepresentedRate)}</td>
								<td class="num">{formatDuration(j.medianDurationSeconds)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="caption">
					Rates are shares of hearings where the watcher recorded that item. Money bail and ROR
					rates use release decisions as the denominator; “no lawyer” uses hearings where
					representation was recorded.
				</p>
			</section>

			<section class="method">
				<h2>About this data</h2>
				<p>
					Trained volunteers sat in public courtrooms and recorded each hearing as it happened,
					using Courtnotes on their phones. They timed every hearing and noted its type, the defense
					lawyer, the release decision and any bail, and the outcome. Observations reflect what a
					member of the public could see and hear; volunteers did not consult court files.
					Demographic characteristics, where recorded, are the observer’s perception only.
				</p>
				<p>
					Not every hearing in every courtroom was observed, so these figures describe the hearings
					our volunteers attended rather than the court system as a whole. The underlying records
					follow the open Courtnotes data standard (CC0), so findings can be compared with other
					court watch programs.
				</p>
			</section>
		{/if}

		<footer>
			<span>{data.program.name} · Generated with Courtnotes {data.version}</span>
			<span>Data standard: github.com/lobojoel2003/Courtnotes/tree/main/schema</span>
		</footer>
	</article>
</div>

<style>
	:global(html:has(.report-page)),
	:global(body:has(.report-page)) {
		background: #f4f3ef;
		color-scheme: light;
	}
	.report-page {
		--chart-surface: #ffffff;
		--chart-text: #0b0b0b;
		--chart-secondary: #52514e;
		color: #1a1a19;
		min-height: 100dvh;
		padding-bottom: 3rem;
	}
	.toolbar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.6rem clamp(1rem, 3vw, 2rem);
		background: rgb(244 243 239 / 0.92);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid #e1e0d9;
	}
	.spacer {
		flex: 1;
	}
	.tool {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2.4rem;
		padding: 0 0.9rem;
		border-radius: 10px;
		border: 1px solid #d6d4cc;
		background: #fff;
		color: #1a1a19;
		font: inherit;
		font-size: 0.92rem;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
	}
	.tool.primary {
		background: #1a1a19;
		border-color: #1a1a19;
		color: #fff;
	}
	.report {
		max-width: 56rem;
		margin: 2rem auto 0;
		padding: clamp(1.5rem, 5vw, 3.5rem);
		background: #fff;
		border-radius: 6px;
		box-shadow:
			0 1px 2px rgb(0 0 0 / 0.06),
			0 8px 30px rgb(0 0 0 / 0.06);
		line-height: 1.55;
	}
	.masthead {
		border-bottom: 3px solid #1a1a19;
		padding-bottom: 1.25rem;
		margin-bottom: 1.75rem;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-weight: 700;
		font-size: 0.9rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #52514e;
	}
	h1 {
		font-size: clamp(2rem, 5vw, 2.8rem);
		letter-spacing: -0.025em;
		margin: 1rem 0 0.4rem;
		color: #0b0b0b;
	}
	.dek {
		font-size: 1.2rem;
		margin: 0;
		color: #333;
	}
	.meta {
		margin: 0.5rem 0 0;
		color: #6f6d68;
		font-size: 0.92rem;
	}
	section {
		margin: 2rem 0;
	}
	h2 {
		font-size: 1.2rem;
		margin-bottom: 0.4rem;
		color: #0b0b0b;
	}
	.caption {
		margin: 0 0 0.9rem;
		color: #6f6d68;
		font-size: 0.88rem;
	}
	.findings {
		margin: 0.75rem 0 0;
		padding-left: 1.2rem;
		display: grid;
		gap: 0.5rem;
		font-size: 1.05rem;
	}
	.figures {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1px;
		background: #e1e0d9;
		border: 1px solid #e1e0d9;
		border-radius: 8px;
		overflow: hidden;
	}
	.figures div {
		background: #fff;
		padding: 1rem 1.1rem;
		display: grid;
		gap: 0.15rem;
	}
	.figures strong {
		font-size: 1.8rem;
		letter-spacing: -0.02em;
		color: #0b0b0b;
		line-height: 1.15;
	}
	.figures span {
		color: #52514e;
		font-size: 0.88rem;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
	}
	.two section {
		margin: 0;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
		margin-top: 0.75rem;
	}
	th,
	td {
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid #e8e7e1;
		text-align: left;
	}
	thead th {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #6f6d68;
		border-bottom: 1px solid #c3c2b7;
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.method p {
		color: #333;
		margin: 0 0 0.75rem;
	}
	footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 2.5rem;
		padding-top: 1rem;
		border-top: 1px solid #e1e0d9;
		color: #6f6d68;
		font-size: 0.8rem;
	}
	@media (max-width: 700px) {
		.figures {
			grid-template-columns: 1fr 1fr;
		}
		.two {
			grid-template-columns: 1fr;
		}
	}
	@media print {
		:global(html),
		:global(body) {
			background: #fff !important;
		}
		.no-print {
			display: none !important;
		}
		.report {
			margin: 0;
			padding: 0;
			box-shadow: none;
			max-width: none;
		}
		.avoid-break {
			break-inside: avoid;
		}
	}
</style>
