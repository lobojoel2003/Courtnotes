<script lang="ts">
	let { size = 32, title = 'Courtnotes' }: { size?: number; title?: string } = $props();
</script>

<!-- A courthouse pediment over three lines of notes. -->
<svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
	<rect width="64" height="64" rx="15" fill="#15171b" />
	<path d="M12 25 32 12l20 13z" fill="#e8b04a" />
	<rect x="14" y="31" width="36" height="4.5" rx="2.25" fill="#ece9e2" />
	<rect x="14" y="40" width="28" height="4.5" rx="2.25" fill="#ece9e2" opacity="0.75" />
	<rect x="14" y="49" width="20" height="4.5" rx="2.25" fill="#ece9e2" opacity="0.5" />
</svg>
