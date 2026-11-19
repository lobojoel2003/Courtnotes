/**
 * Chart builders for the dashboard (dark) and the published report (light), on Observable Plot.
 *
 * Conventions (validated palette, see docs/architecture.md):
 * - categorical slots are assigned in a fixed order and follow the category, never its rank;
 * - bars are at most 24px thick with a 4px rounded data end and a 2px surface gap;
 * - gridlines are solid hairlines; text uses ink tokens, never series colours;
 * - every mark has a hover tooltip, and every value is also in a table on the page.
 */
import type * as PlotModule from '@observablehq/plot';
import type { DayRow, JudgeRow } from './stats.ts';
import { DECIDED, UNKNOWN_JUDGE, durationOf, formatMoney, formatPercent } from './stats.ts';
import type { Observation } from './schema/types.ts';
import { label } from './schema/vocab.ts';

type Plot = typeof PlotModule;

export interface ChartTheme {
	surface: string;
	text: string;
	secondary: string;
	muted: string;
	grid: string;
	axis: string;
	series: readonly string[];
}

/** Categorical slots validated against each surface (scripts in the dataviz method). */
export const THEMES: Record<'dark' | 'light', ChartTheme> = {
	dark: {
		surface: '#15171b',
		text: '#ece9e2',
		secondary: '#c3c2b7',
		muted: '#8d8f96',
		grid: '#26292f',
		axis: '#3a3d44',
		series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c']
	},
	light: {
		surface: '#ffffff',
		text: '#0b0b0b',
		secondary: '#52514e',
		muted: '#6f6d68',
		grid: '#e8e7e1',
		axis: '#c3c2b7',
		series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']
	}
};

/** Text inside a filled segment: white, except near-black on light yellow. */
export function inkOn(fill: string): string {
	return fill === '#eda100' ? '#0b0b0b' : '#ffffff';
}

const BAR_MAX = 24;

function style(theme: ChartTheme) {
	return {
		background: 'transparent',
		color: theme.secondary,
		fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
		fontSize: '12px',
		overflow: 'visible'
	};
}

const compactMoney = (n: number) =>
	n >= 1_000_000
		? `$${+(n / 1_000_000).toFixed(1)}M`
		: n >= 1000
			? `$${+(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`
			: `$${n}`;

function bandInset(slots: number, length: number): number {
	const band = length / Math.max(1, slots);
	return Math.max(1, (band - BAR_MAX) / 2);
}

function judgeMargin(names: string[]): number {
	const longest = Math.max(0, ...names.map((n) => n.length));
	return Math.min(190, Math.max(70, longest * 6.6 + 14));
}

const parseDay = (d: string) => new Date(`${d}T00:00:00Z`);

/** Hearings observed per day (columns). Shifts per day ride in the tooltip. */
export function hearingsPerDay(Plot: Plot, days: DayRow[], width: number, theme: ChartTheme) {
	const height = 220;
	const first = days.length ? parseDay(days[0].date).getTime() : 0;
	const last = days.length ? parseDay(days[days.length - 1].date).getTime() : 0;
	const span = Math.max(1, Math.round((last - first) / 86400000) + 1);
	const inset = bandInset(span, width - 50);
	return Plot.plot({
		width,
		height,
		marginLeft: 40,
		marginBottom: 30,
		style: style(theme),
		x: { type: 'utc', label: null, ticks: Math.min(8, Math.max(2, Math.floor(width / 90))) },
		y: {
			label: null,
			grid: true,
			nice: true,
			tickFormat: (n: number) => n.toLocaleString('en-US')
		},
		marks: [
			Plot.gridY({ stroke: theme.grid, strokeOpacity: 1 }),
			Plot.rectY(days, {
				x: (d: DayRow) => parseDay(d.date),
				interval: 'day',
				y: 'hearings',
				fill: theme.series[0],
				insetLeft: inset,
				insetRight: inset,
				ry2: 4,
				title: (d: DayRow) =>
					`${parseDay(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}\n${d.hearings} hearings · ${d.shifts} shift${d.shifts === 1 ? '' : 's'}`,
				tip: { fill: theme.surface, stroke: theme.axis }
			}),
			Plot.ruleY([0], { stroke: theme.axis })
		]
	});
}

/** Hearings observed per judge (bars, value at the tip). */
export function casesPerJudge(Plot: Plot, judges: JudgeRow[], width: number, theme: ChartTheme) {
	const rows = judges.slice(0, 15);
	const height = rows.length * 34 + 36;
	const marginLeft = judgeMargin(rows.map((r) => r.judge));
	return Plot.plot({
		width,
		height,
		marginLeft,
		marginRight: 44,
		marginBottom: 26,
		style: style(theme),
		x: {
			label: null,
			grid: true,
			nice: true,
			tickFormat: (n: number) => n.toLocaleString('en-US')
		},
		y: { label: null, domain: rows.map((r) => r.judge), tickSize: 0 },
		marks: [
			Plot.gridX({ stroke: theme.grid, strokeOpacity: 1 }),
			Plot.barX(rows, {
				y: 'judge',
				x: 'hearings',
				fill: theme.series[0],
				insetTop: bandInset(rows.length, height - 36),
				insetBottom: bandInset(rows.length, height - 36),
				rx2: 4,
				title: (d: JudgeRow) => `${d.judge}\n${d.hearings} hearings observed`,
				tip: { fill: theme.surface, stroke: theme.axis }
			}),
			Plot.text(rows, {
				y: 'judge',
				x: 'hearings',
				text: (d: JudgeRow) => d.hearings.toLocaleString('en-US'),
				dx: 6,
				textAnchor: 'start',
				fill: theme.text,
				fontWeight: 600
			}),
			Plot.ruleX([0], { stroke: theme.axis })
		]
	});
}

export const RELEASE_ORDER = DECIDED;

interface ReleaseRow {
	judge: string;
	decision: string;
	label: string;
	count: number;
	share: number;
	total: number;
}

export function releaseRows(observations: Observation[], judges: string[]): ReleaseRow[] {
	const counts = new Map<string, Map<string, number>>();
	for (const o of observations) {
		if (!o.release_decision || !DECIDED.includes(o.release_decision)) continue;
		const judge = o.judge?.name ?? UNKNOWN_JUDGE;
		if (!judges.includes(judge)) continue;
		const m = counts.get(judge) ?? new Map<string, number>();
		m.set(o.release_decision, (m.get(o.release_decision) ?? 0) + 1);
		counts.set(judge, m);
	}
	const rows: ReleaseRow[] = [];
	for (const judge of judges) {
		const m = counts.get(judge);
		if (!m) continue;
		const total = [...m.values()].reduce((a, b) => a + b, 0);
		for (const decision of DECIDED) {
			const count = m.get(decision) ?? 0;
			if (count) {
				rows.push({
					judge,
					decision,
					label: label('release_decision', decision),
					count,
					share: count / total,
					total
				});
			}
		}
	}
	return rows;
}

/** Share of release decisions per judge (100% stacked bars), sorted by money-bail rate. */
export function releaseByJudge(
	Plot: Plot,
	observations: Observation[],
	judges: JudgeRow[],
	width: number,
	theme: ChartTheme
) {
	const sorted = judges
		.filter((j) => j.releaseDecided > 0)
		.sort((a, b) => (b.bailSetRate ?? 0) - (a.bailSetRate ?? 0))
		.slice(0, 15)
		.map((j) => j.judge);
	const rows = releaseRows(observations, sorted);
	const height = sorted.length * 34 + 36;
	return Plot.plot({
		width,
		height,
		marginLeft: judgeMargin(sorted),
		marginRight: 12,
		marginBottom: 26,
		style: style(theme),
		x: { label: null, percent: true, tickFormat: (n: number) => `${n}%`, ticks: 5 },
		y: { label: null, domain: sorted, tickSize: 0 },
		color: {
			domain: DECIDED.map((d) => label('release_decision', d)),
			range: theme.series.slice(0, DECIDED.length)
		},
		marks: [
			Plot.barX(
				rows,
				Plot.stackX({
					y: 'judge',
					x: 'share',
					fill: 'label',
					order: DECIDED.map((d) => label('release_decision', d)),
					insetTop: bandInset(sorted.length, height - 36),
					insetBottom: bandInset(sorted.length, height - 36),
					insetLeft: 1,
					insetRight: 1,
					title: (d: ReleaseRow) =>
						`${d.judge}\n${d.label}: ${formatPercent(d.share)} (${d.count} of ${d.total})`,
					tip: { fill: theme.surface, stroke: theme.axis }
				})
			),
			Plot.ruleX([0], { stroke: theme.axis })
		]
	});
}

const BAIL_TICKS = [
	100, 250, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000
];

interface BailPoint {
	judge: string;
	row: number;
	amount: number;
	jitter: number;
	hearing: string;
}

/** Every money bail set, per judge (dot strip, log scale), with each judge's median marked. */
export function bailByJudge(
	Plot: Plot,
	observations: Observation[],
	judges: JudgeRow[],
	width: number,
	theme: ChartTheme
) {
	const names = judges
		.filter((j) => j.medianBail !== null)
		.sort((a, b) => (b.medianBail ?? 0) - (a.medianBail ?? 0))
		.slice(0, 15)
		.map((j) => j.judge);
	const index = new Map(names.map((n, i) => [n, i]));
	// Deterministic jitter so the chart doesn't shimmer on every refresh.
	const jitter = (id: string) => {
		let h = 0;
		for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
		return ((h >>> 0) % 1000) / 1000 - 0.5;
	};
	const points: BailPoint[] = observations.flatMap((o) => {
		const judge = o.judge?.name ?? UNKNOWN_JUDGE;
		if (o.release_decision !== 'bail_set' || !o.bail || !index.has(judge) || o.bail.amount <= 0) {
			return [];
		}
		return [
			{
				judge,
				row: index.get(judge)!,
				amount: o.bail.amount,
				jitter: jitter(o.id) * 0.56,
				hearing: label('hearing_type', o.hearing_type)
			}
		];
	});
	const medians = judges
		.filter((j) => index.has(j.judge) && j.medianBail)
		.map((j) => ({ row: index.get(j.judge)!, median: j.medianBail!, judge: j.judge }));
	const height = names.length * 48 + 44;
	const amounts = points.map((p) => p.amount);
	const lo = Math.min(...amounts);
	const hi = Math.max(...amounts);
	const ticks = BAIL_TICKS.filter((t) => t >= lo / 1.5 && t <= hi * 1.5);
	return Plot.plot({
		width,
		height,
		marginLeft: judgeMargin(names),
		marginRight: 24,
		marginBottom: 30,
		style: style(theme),
		x: { type: 'log', label: null, ticks, tickFormat: compactMoney },
		y: {
			label: null,
			domain: [names.length - 0.5, -0.5],
			ticks: names.map((_, i) => i),
			tickFormat: (i: number) => names[i] ?? '',
			tickSize: 0
		},
		marks: [
			Plot.gridX(ticks, { stroke: theme.grid, strokeOpacity: 1 }),
			Plot.dot(points, {
				x: 'amount',
				y: (d: BailPoint) => d.row + d.jitter,
				r: 4.5,
				fill: theme.series[0],
				fillOpacity: 0.75,
				stroke: theme.surface,
				strokeWidth: 1.5,
				title: (d: BailPoint) => `${d.judge}\n${formatMoney(d.amount)} · ${d.hearing}`,
				tip: { fill: theme.surface, stroke: theme.axis }
			}),
			Plot.ruleX(medians, {
				x: 'median',
				y1: (d: { row: number }) => d.row - 0.36,
				y2: (d: { row: number }) => d.row + 0.36,
				stroke: theme.text,
				strokeWidth: 2.5,
				strokeLinecap: 'round'
			}),
			Plot.text(medians, {
				x: 'median',
				y: (d: { row: number }) => d.row - 0.36,
				text: (d: { median: number }) => `median ${compactMoney(d.median)}`,
				dy: -7,
				fill: theme.text,
				fontSize: 11,
				fontWeight: 600
			})
		]
	});
}

interface DurationBin {
	x1: number;
	x2: number;
	count: number;
	label: string;
}

export function durationBins(
	observations: Observation[],
	capMinutes = 10,
	step = 0.5
): DurationBin[] {
	const n = Math.round(capMinutes / step);
	const bins: DurationBin[] = Array.from({ length: n + 1 }, (_, i) => ({
		x1: i * step,
		x2: i === n ? capMinutes + step : (i + 1) * step,
		count: 0,
		label: i === n ? `${capMinutes}+ min` : `${i * step}–${(i + 1) * step} min`
	}));
	for (const o of observations) {
		const s = durationOf(o);
		if (s === null) continue;
		const i = Math.min(n, Math.floor(s / 60 / step));
		bins[i].count++;
	}
	return bins;
}

/** How long hearings last (histogram, 30-second bins, last bin open-ended). */
export function hearingLength(
	Plot: Plot,
	observations: Observation[],
	width: number,
	theme: ChartTheme
) {
	const bins = durationBins(observations);
	const cap = bins[bins.length - 1].x1;
	return Plot.plot({
		width,
		height: 220,
		marginLeft: 40,
		marginBottom: 32,
		style: style(theme),
		x: {
			label: 'Minutes',
			labelAnchor: 'right',
			domain: [0, cap + 0.5],
			ticks: Array.from({ length: cap / 2 + 1 }, (_, i) => i * 2),
			tickFormat: (n: number) => (n === cap ? `${n}+` : `${n}`)
		},
		y: { label: null, grid: true, nice: true },
		marks: [
			Plot.gridY({ stroke: theme.grid, strokeOpacity: 1 }),
			Plot.rectY(bins, {
				x1: 'x1',
				x2: 'x2',
				y: 'count',
				fill: theme.series[0],
				insetLeft: 1,
				insetRight: 1,
				ry2: 4,
				title: (d: DurationBin) => `${d.label}\n${d.count} hearings`,
				tip: { fill: theme.surface, stroke: theme.axis }
			}),
			Plot.ruleY([0], { stroke: theme.axis })
		]
	});
}

export interface JudgeChartData {
	observations: Observation[];
	judges: JudgeRow[];
}

/** Typed builders for `<Chart data=… build=…>`; the chart redraws whenever its data changes. */
export function builders(theme: ChartTheme) {
	return {
		perDay: (P: Plot, w: number, days: DayRow[]) => hearingsPerDay(P, days, w, theme),
		perJudge: (P: Plot, w: number, judges: JudgeRow[]) => casesPerJudge(P, judges, w, theme),
		length: (P: Plot, w: number, observations: Observation[]) =>
			hearingLength(P, observations, w, theme),
		release: (P: Plot, w: number, d: JudgeChartData) =>
			releaseByJudge(P, d.observations, d.judges, w, theme),
		bail: (P: Plot, w: number, d: JudgeChartData) =>
			bailByJudge(P, d.observations, d.judges, w, theme)
	};
}
