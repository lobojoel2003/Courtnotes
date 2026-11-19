<script lang="ts" module>
	// Simple 24×24 stroke icons drawn for Courtnotes.
	const paths = {
		home: 'M3 10.5 12 3l9 7.5M5.5 8.6V21h13V8.6M10 21v-6h4v6',
		history: 'M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4v4h4',
		settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
		plus: 'M12 5v14M5 12h14',
		check: 'M5 12.5l4.5 4.5L19 7.5',
		x: 'M6 6l12 12M18 6 6 18',
		left: 'M15 5l-7 7 7 7',
		right: 'M9 5l7 7-7 7',
		down: 'M5 9l7 7 7-7',
		play: 'M8 5.5v13l10.5-6.5z',
		pause: 'M8 5v14M16 5v14',
		stop: 'M7 7h10v10H7z',
		trash: 'M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v6M14 11v6',
		download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
		refresh: 'M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4',
		cloud: 'M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.1 4.5 4.5 0 0 0 7 18z',
		cloudOff: 'M3 3l18 18M8.5 6.4A6 6 0 0 1 17.6 10a4 4 0 0 1 2 6.9M17 18H7a4.5 4.5 0 0 1-1.2-8.8',
		alert: 'M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.3',
		upload: 'M12 20V9M7 13.5l5-5 5 5M5 4h14',
		user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
		edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
		gavel: 'M13.5 4.5l6 6M11 7l6 6M14.5 9.5 5 19M4 21h9',
		chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
		logout: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9',
		external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
		eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
		moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
		printer: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z'
	} as const;

	export type IconName = keyof typeof paths;
</script>

<script lang="ts">
	let {
		name,
		size = 22,
		label,
		strokeWidth = 2
	}: { name: IconName; size?: number; label?: string; strokeWidth?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill={name === 'play' ? 'currentColor' : 'none'}
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
>
	<path d={paths[name]} />
</svg>
