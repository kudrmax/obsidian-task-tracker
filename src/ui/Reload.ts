/**
 * One fetch at a time. A request during a fetch is served by one more fetch after it, and only the freshest value is
 * applied: what is shown is never older than the last request, and a burst of requests costs two fetches at most.
 */
export class Reload<T> {
	private running: Promise<void> | null = null;
	private requested = false;

	constructor(
		private readonly fetch: () => Promise<T>,
		private readonly apply: (value: T) => void,
	) {}

	/** Resolves once a value fetched after this call is applied. */
	request(): Promise<void> {
		this.requested = true;
		this.running ??= this.drain().finally(() => (this.running = null));
		return this.running;
	}

	private async drain(): Promise<void> {
		let value: T;
		do {
			this.requested = false;
			value = await this.fetch();
		} while (this.requested);
		this.apply(value);
	}
}
