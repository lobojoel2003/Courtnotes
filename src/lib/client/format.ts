/** Device-local date and time formatting for the watcher app. */

export function clock(iso: string): string {
	return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function shortDate(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});
}

/** Stopwatch display: 0:42, 2:41, 1:02:41. */
export function stopwatch(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const ss = String(s).padStart(2, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "2h 13m" / "13m" / "just now" */
export function span(ms: number): string {
	const minutes = Math.floor(ms / 60000);
	if (minutes < 1) return 'just now';
	const h = Math.floor(minutes / 60);
	return h ? `${h}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
}

export function ago(timestamp: number, now = Date.now()): string {
	const s = Math.round((now - timestamp) / 1000);
	if (s < 45) return 'just now';
	const m = Math.round(s / 60);
	if (m < 60) return `${m} min ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h} h ago`;
	return `${Math.round(h / 24)} d ago`;
}

/** "25000" → "25,000"; strips anything that isn't a digit. */
export function groupDigits(value: string): string {
	const digits = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
	return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function parseAmount(value: string): number | undefined {
	const digits = value.replace(/\D/g, '');
	return digits ? Number(digits) : undefined;
}

export function money(amount: number | undefined, currency = 'USD'): string {
	if (amount === undefined) return '';
	return new Intl.NumberFormat(undefined, {
		style: 'currency',
		currency,
		maximumFractionDigits: 0
	}).format(amount);
}

/** "Courtroom 1101" for numbered rooms, the name as-is for "Arraignment Court B". */
export function courtroomLabel(court: { name: string; courtroom?: string } | undefined): string {
	if (!court) return '';
	const room = court.courtroom?.trim();
	if (!room) return court.name;
	return /^[A-Z]?-?\d/i.test(room) && room.length <= 8 ? `Courtroom ${room}` : room;
}
