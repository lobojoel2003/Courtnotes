/**
 * Shared loading for the coordinator dashboard, records view and report: one place that turns
 * URL parameters into filters, so every page and export agrees on the slice of data.
 */
import { dayKey } from '../stats.ts';
import type { Filters } from './records.ts';
import { parseFilters } from './records.ts';

export const RANGES = [
	{ value: '7d', label: 'Last 7 days', days: 7 },
	{ value: '30d', label: 'Last 30 days', days: 30 },
	{ value: '90d', label: 'Last 90 days', days: 90 },
	{ value: '365d', label: 'Last 12 months', days: 365 },
	{ value: 'all', label: 'All time', days: null },
	{ value: 'custom', label: 'Custom range', days: null }
] as const;

export type RangeValue = (typeof RANGES)[number]['value'];

export interface ResolvedFilters {
	range: RangeValue;
	filters: Filters;
	/** Human-readable description, e.g. "Last 30 days" or "Mar 1 – Mar 31, 2026". */
	description: string;
}

function shiftDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

function prettyDate(date: string): string {
	return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

export function resolveFilters(
	params: URLSearchParams,
	timeZone: string,
	defaultRange: RangeValue = '30d',
	now = new Date()
): ResolvedFilters {
	const parsed = parseFilters(params);
	const requested = params.get('range') as RangeValue | null;
	let range: RangeValue = RANGES.some((r) => r.value === requested) ? requested! : defaultRange;
	if (!requested && (parsed.from || parsed.to)) range = 'custom';

	const filters: Filters = { court: parsed.court, judge: parsed.judge };
	let description: string;
	const preset = RANGES.find((r) => r.value === range)!;
	if (preset.days) {
		const today = dayKey(now.toISOString(), timeZone);
		filters.from = shiftDays(today, -(preset.days - 1));
		filters.to = today;
		description = preset.label;
	} else if (range === 'custom') {
		filters.from = parsed.from;
		filters.to = parsed.to;
		description =
			parsed.from && parsed.to
				? `${prettyDate(parsed.from)} – ${prettyDate(parsed.to)}`
				: parsed.from
					? `Since ${prettyDate(parsed.from)}`
					: parsed.to
						? `Until ${prettyDate(parsed.to)}`
						: 'All time';
	} else {
		description = 'All time';
	}
	for (const key of Object.keys(filters) as (keyof Filters)[]) {
		if (!filters[key]) delete filters[key];
	}
	return { range, filters, description };
}

/** Query string for links and exports that carry the current filters. */
export function filterQuery(filters: Filters, extra: Record<string, string> = {}): string {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(filters as Record<string, string | undefined>)) {
		if (v) params.set(k, v);
	}
	for (const [k, v] of Object.entries(extra)) params.set(k, v);
	const s = params.toString();
	return s ? `?${s}` : '';
}
