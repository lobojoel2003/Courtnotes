import { describe, expect, it } from 'vitest';
import { filterQuery, resolveFilters } from './dashboard.ts';

const now = new Date('2026-04-15T02:00:00Z'); // still April 14 in New York

describe('resolveFilters', () => {
	it('defaults to the last 30 days in the program time zone', () => {
		const r = resolveFilters(new URLSearchParams(), 'America/New_York', '30d', now);
		expect(r.range).toBe('30d');
		expect(r.filters).toEqual({ from: '2026-03-16', to: '2026-04-14' });
		expect(r.description).toBe('Last 30 days');
	});

	it('supports all-time and custom ranges plus court and judge', () => {
		expect(
			resolveFilters(new URLSearchParams('range=all&judge=X'), 'UTC', '30d', now)
		).toMatchObject({
			range: 'all',
			filters: { judge: 'X' },
			description: 'All time'
		});
		const custom = resolveFilters(
			new URLSearchParams('from=2026-03-01&to=2026-03-31'),
			'UTC',
			'30d',
			now
		);
		expect(custom.range).toBe('custom');
		expect(custom.filters).toEqual({ from: '2026-03-01', to: '2026-03-31' });
		expect(custom.description).toBe('Mar 1, 2026 – Mar 31, 2026');
	});

	it('ignores unknown ranges', () => {
		expect(resolveFilters(new URLSearchParams('range=forever'), 'UTC', '7d', now).range).toBe('7d');
	});

	it('builds query strings for exports', () => {
		expect(filterQuery({ from: '2026-01-01', judge: 'Hon. A' }, { public: '1' })).toBe(
			'?from=2026-01-01&judge=Hon.+A&public=1'
		);
		expect(filterQuery({})).toBe('');
	});
});
