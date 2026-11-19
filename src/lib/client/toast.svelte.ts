/** A brief, silent confirmation shown at the bottom of the screen. */
class ToastState {
	message = $state<string | null>(null);
	#timer: ReturnType<typeof setTimeout> | undefined;

	show(text: string, ms = 2600): void {
		this.message = text;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.message = null), ms);
	}
}

export const toastState = new ToastState();

export function toast(text: string, ms?: number): void {
	toastState.show(text, ms);
}
