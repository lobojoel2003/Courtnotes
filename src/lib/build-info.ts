/** Version metadata injected at build time (see vite.config.ts). */
export const buildInfo = {
	version: __APP_VERSION__,
	build: __BUILD_NUMBER__,
	commit: __COMMIT_SHA__,
	date: __BUILD_DATE__
} as const;

/** e.g. "v1.2.0 · build 57 · 3f2c1ab" */
export function versionLabel(): string {
	const parts = [`v${buildInfo.version}`];
	if (buildInfo.build !== 'dev') parts.push(`build ${buildInfo.build}`);
	else parts.push('dev build');
	if (buildInfo.commit !== 'unknown') parts.push(buildInfo.commit);
	return parts.join(' · ');
}
