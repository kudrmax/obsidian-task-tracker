import { describe } from "../lifecycle/ActionLog";
import { ChainTooLong, type Cmd, microtasks, type Program, type Scheduler, type StoreRuntime } from "./Program";
import { sameViews, type Views } from "./ViewAnswers";

/** How many messages one message's chain of door answers may run to. */
export const CHAIN_BOUND = 64;

export interface StoreOptions<Model> {
	/** Draws the model: called once a pass, when the model changed. */
	readonly render?: (model: Model) => void;
	readonly scheduler?: Scheduler;
	readonly chainBound?: number;
}

/**
 * A screen's store (P2): its model changes only by messages, one at a time, in the order they came, never nested. One
 * pass of the loop: each message's `update`, its door commands run at once with their answers fed back until the chain
 * is drained; then the views the screen needs, read from the replica and handed in as `viewsChanged`; then the render,
 * then the effects. A user's event runs the pass inside the event (`dispatch`); a message from elsewhere, and any change
 * of the replica, run it once per microtask (`post`). A store draws its first frame on its own, in the microtask after it
 * is made (its views read, then the render), with no message; a host that must draw at once, inside the event that
 * mounted it, calls `flush`.
 */
export class Store<Model, Msg> {
	private current: Model;
	private readonly queue: Msg[] = [];
	private readonly effects: Extract<Cmd<Msg>, { kind: "effect" }>[] = [];
	private running = false;
	private scheduled = false;
	private stale = true;
	private views: Views | null = null;
	private drawn: Model | null = null;
	private readonly unsubscribe: () => void;
	private disposed = false;

	constructor(
		private readonly program: Program<Model, Msg>,
		initial: Model,
		private readonly runtime: StoreRuntime,
		private readonly options: StoreOptions<Model> = {},
	) {
		this.current = initial;
		this.unsubscribe = runtime.subscribe((event) => {
			const msg = event === null ? null : program.fromRuntime(event);
			this.stale = true;
			if (msg !== null) this.queue.push(msg);
			this.schedule();
		});
		this.schedule();
	}

	/** The pass now: a host mounting the store inside a user's event draws its first frame there. */
	flush(): void {
		this.pass();
	}

	get model(): Model {
		return this.current;
	}

	/** A user's event: the whole pass runs now, inside it (or after the pass under way, if it came from inside one). */
	dispatch(msg: Msg): void {
		this.queue.push(msg);
		this.pass();
	}

	/** A message from elsewhere: handled in the next microtask, with whatever else came meanwhile. */
	post = (msg: Msg): void => {
		this.queue.push(msg);
		this.schedule();
	};

	dispose(): void {
		this.disposed = true;
		this.unsubscribe();
	}

	private schedule(): void {
		if (this.scheduled || this.disposed) return;
		this.scheduled = true;
		(this.options.scheduler ?? microtasks).microtask(() => {
			this.scheduled = false;
			this.pass();
		});
	}

	private pass(): void {
		if (this.running || this.disposed) return;
		this.running = true;
		try {
			do {
				do {
					while (this.queue.length > 0) this.chain(this.queue.shift()!);
					this.refreshViews();
				} while (this.queue.length > 0);
				if (this.current !== this.drawn) {
					this.drawn = this.current;
					this.options.render?.(this.current);
				}
				for (const effect of this.effects.splice(0)) effect.run(this.post);
			} while (this.queue.length > 0);
		} finally {
			this.running = false;
		}
	}

	/** One message and the door answers fed back after it, until none is left or the bound is passed. */
	private chain(first: Msg): void {
		const bound = this.options.chainBound ?? CHAIN_BOUND;
		const chain: Msg[] = [first];
		for (let steps = 0; chain.length > 0; steps++) {
			if (steps >= bound) {
				this.queue.length = 0;
				throw new ChainTooLong(bound, this.runtime.log.dump());
			}
			const msg = chain.shift()!;
			this.runtime.log.record(describe(msg));
			const [model, cmds] = this.program.update(this.current, msg);
			if (model !== this.current) this.stale = true;
			this.current = model;
			for (const cmd of cmds) {
				if (cmd.kind === "effect") {
					this.effects.push(cmd);
					continue;
				}
				this.runtime.log.record(`door ${cmd.method}`);
				const reply = cmd.reply(this.runtime.call(cmd.method, cmd.args));
				this.stale = true;
				if (reply !== null) chain.push(reply);
			}
		}
	}

	/** The views the model needs now, from the replica as it stands: handed in when any answer is another. */
	private refreshViews(): void {
		const bound = this.options.chainBound ?? CHAIN_BOUND;
		for (let rounds = 0; this.stale; rounds++) {
			if (rounds >= bound) throw new ChainTooLong(bound, this.runtime.log.dump());
			this.stale = false;
			const views = this.runtime.views(this.program.needs(this.current));
			if (sameViews(this.views, views)) return;
			this.views = views;
			this.chain(this.program.viewsChanged(views));
		}
	}
}
