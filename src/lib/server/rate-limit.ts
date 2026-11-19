/**
 * Small in-memory fixed-window limiter, used to slow down guessing of passwords and access codes.
 * Per process; behind several replicas each one limits independently, which is fine for this.
 */
export class RateLimiter {
	#hits = new Map<string, { count: number; resetAt: number }>();

	constructor(
		readonly limit: number,
		readonly windowMs: number
	) {}

	/** Records a failed attempt. */
	hit(key: string, now = Date.now()): void {
		const entry = this.#hits.get(key);
		if (!entry || entry.resetAt <= now) {
			this.#hits.set(key, { count: 1, resetAt: now + this.windowMs });
		} else {
			entry.count++;
		}
		if (this.#hits.size > 10_000) this.#sweep(now);
	}

	/** Seconds until the key may try again, or 0 if it isn't limited. */
	retryAfter(key: string, now = Date.now()): number {
		const entry = this.#hits.get(key);
		if (!entry || entry.resetAt <= now || entry.count < this.limit) return 0;
		return Math.ceil((entry.resetAt - now) / 1000);
	}

	reset(key: string): void {
		this.#hits.delete(key);
	}

	#sweep(now: number) {
		for (const [key, entry] of this.#hits) if (entry.resetAt <= now) this.#hits.delete(key);
	}
}

/** Shared limiters: 10 failures per 15 minutes per client address. */
export const loginLimiter = new RateLimiter(10, 15 * 60 * 1000);
export const accessCodeLimiter = new RateLimiter(20, 15 * 60 * 1000);
