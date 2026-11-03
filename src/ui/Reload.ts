/**
 * One fetch at a time. A request during a fetch is served by one more fetch after it, and only the freshest value is
 * applied: what is shown is never older than the last request, and a burst of requests costs two fetches at most.
 */
export class Reload<T> {
	private running: Promise<void> | null = null;
	private requested = false;
	/** Run right before the value is applied; all belong to the running fetch, and go with it when it fails. */
	private hooks: (() => void)[] = [];

	constructor(
		private readonly fetch: () => Promise<T>,
		private readonly apply: (value: T) => void,
	) {}

	/** Resolves once a value fetched after this call is applied; `beforeApply` runs right before it is. */
	request(beforeApply?: () => void): Promise<void> {
		this.requested = true;
		if (beforeApply) this.hooks.push(beforeApply);
		this.running ??= this.drain();
		return this.running;
	}

	/** It lets go of the screen before applying: a request made from here on is served by a fetch of its own. */
	private async drain(): Promise<void> {
		let value: T;
		try {
			do {
				this.requested = false;
				value = await this.fetch();
			} while (this.requested);
		} catch (error) {
			this.hooks = [];
			this.running = null;
			throw error;
		}
		const hooks = this.hooks.splice(0);
		this.running = null;
		hooks.forEach((hook) => hook());
		this.apply(value);
	}
}
