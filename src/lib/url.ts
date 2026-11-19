/** Copy a query string with one parameter replaced, e.g. for pagination and filter links. */
export function withParam(search: string, key: string, value: string): string {
	const params = new URLSearchParams(search);
	params.set(key, value);
	return `?${params.toString()}`;
}

/** Read a text field from submitted form data; files and missing fields become "". */
export function formText(form: FormData, key: string, max = 1000): string {
	const value = form.get(key);
	return typeof value === 'string' ? value.slice(0, max) : '';
}
