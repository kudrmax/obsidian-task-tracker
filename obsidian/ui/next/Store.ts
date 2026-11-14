/** What an action leaves: the screen's next state and the work it asks for, run after every earlier piece of work. */
export interface Step<S, E> {
	readonly state: S;
	readonly effects?: readonly E[];
}

export type Reduce<S, A, E> = (state: S, action: A) => Step<S, E>;

/** Runs one piece of work; what it learns comes back only as actions. */
export type Run<A, E> = (effect: E, dispatch: (action: A) => void) => Promise<void>;

/**
 * The screen's one state and its one queue of work. An action changes the state at once and synchronously; the work
 * it asks for (a write, a read of the file) runs strictly after all work asked before it, so a read always sees every
 * write queued ahead of it. Views only draw `state` and turn gestures into actions.
 */
export class Store<S, A, E> {
	private current: S;
	private readonly listeners = new Set<(state: S) => void>();
	private queue: Promise<void> = Promise.resolve();

	constructor(
		initial: S,
		private readonly reduce: Reduce<S, A, E>,
		private readonly run: Run<A, E>,
		private readonly failed: (error: unknown) => void = () => {},
	) {
		this.current = initial;
	}

	get state(): S {
		return this.current;
	}

	readonly dispatch = (action: A): void => {
		const step = this.reduce(this.current, action);
		if (step.state !== this.current) {
			this.current = step.state;
			for (const listener of this.listeners) listener(this.current);
		}
		for (const effect of step.effects ?? []) this.enqueue(effect);
	};

	subscribe(listener: (state: S) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Settles once every piece of work queued so far has run. */
	idle(): Promise<void> {
		return this.queue;
	}

	private enqueue(effect: E): void {
		this.queue = this.queue.then(() => this.run(effect, this.dispatch)).catch(this.failed);
	}
}
