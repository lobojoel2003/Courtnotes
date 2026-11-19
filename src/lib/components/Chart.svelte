<script lang="ts" generics="T">
	import type { Attachment } from 'svelte/attachments';
	import type * as PlotModule from '@observablehq/plot';

	type PlotLib = typeof PlotModule;

	interface Props {
		/** Accessible description of the chart. */
		label: string;
		/** The data to draw; the chart redraws whenever this changes. */
		data: T;
		/** Builds the chart for the current width. */
		build: (plot: PlotLib, width: number, data: T) => Element;
		minHeight?: number;
	}

	let { label, data, build, minHeight = 180 }: Props = $props();

	let failed = $state(false);

	// Observable Plot draws imperatively, so the chart lives in an attachment: it is loaded on
	// demand, and redrawn when the container is resized or the data or builder change.
	const plot: Attachment<HTMLDivElement> = (node) => {
		let width = $state(0);
		const observer = new ResizeObserver(([entry]) => {
			width = Math.floor(entry.contentRect.width);
		});
		observer.observe(node);

		$effect(() => {
			const w = width;
			const input = data;
			const render = build;
			if (!w) return;
			let cancelled = false;
			import('@observablehq/plot')
				.then((Plot) => {
					if (cancelled) return;
					node.replaceChildren(render(Plot, w, input));
					failed = false;
				})
				.catch((err: unknown) => {
					console.error('[courtnotes] chart failed', err);
					failed = true;
				});
			return () => {
				cancelled = true;
			};
		});

		return () => observer.disconnect();
	};
</script>

<div
	class="chart"
	role="img"
	aria-label={label}
	style:min-height="{minHeight}px"
	{@attach plot}
></div>
{#if failed}<p class="muted">
		This chart could not be drawn. The table below has the same data.
	</p>{/if}

<style>
	.chart {
		width: 100%;
		--plot-background: var(--chart-surface, #15171b);
	}
	.chart :global(svg) {
		display: block;
		max-width: 100%;
	}
	.chart :global(g[aria-label='tip']) {
		color: var(--chart-text, #ece9e2);
	}
</style>
