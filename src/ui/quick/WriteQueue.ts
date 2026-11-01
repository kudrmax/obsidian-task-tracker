/** Writes to the file one at a time, in the order pushed. A failing one goes to `onError`, and the next one runs, even when `onError` throws. */
export class WriteQueue {
	private tail: Promise<void> = Promise.resolve();

	constructor(private readonly onError: (error: unknown) => void) {}

	push(job: () => Promise<void>): void {
		this.tail = this.tail
			.then(job)
			.catch((error: unknown) => this.onError(error))
			.catch(() => undefined);
	}

	/** Resolves once every job pushed so far, and every one they pushed, has run. */
	async idle(): Promise<void> {
		let tail: Promise<void>;
		do {
			tail = this.tail;
			await tail;
		} while (tail !== this.tail);
	}
}
