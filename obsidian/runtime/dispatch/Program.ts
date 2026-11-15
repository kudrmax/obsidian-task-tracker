import type { RuntimeEvent } from "../events";
import type { ActionLog } from "../lifecycle/ActionLog";
import type { CallOutcome } from "../replica/ReplicaCalls";
import type { Need, Views } from "./ViewAnswers";

/**
 * Work a message asks for (P2). `door`: a core call, run at once and synchronously right after `update`; its outcome
 * comes back as the next message (`reply`, null for none) before anything is drawn. `effect`: anything else outside the
 * model (a driver, a timer, the network): run after the render, its outcome dispatched later as a message.
 */
export type Cmd<Msg> =
	| { readonly kind: "door"; readonly method: string; readonly args: readonly unknown[]; readonly reply: (outcome: CallOutcome) => Msg | null }
	| { readonly kind: "effect"; readonly run: (dispatch: (msg: Msg) => void) => void };

/** A screen as the dispatch loop runs it: pure functions over its model. */
export interface Program<Model, Msg> {
	update(model: Model, msg: Msg): readonly [Model, readonly Cmd<Msg>[]];
	/** The view answers the screen needs now (its context's view, a neighbour under a swipe, an open card's task…). */
	needs(model: Model): readonly Need[];
	/** The answers to `needs`, handed to the model as data. */
	viewsChanged(views: Views): Msg;
	/** A runtime event as the screen's message (a replay's id map, a file gone…); null: the screen ignores it. */
	fromRuntime(event: RuntimeEvent): Msg | null;
}

/** What a screen's store uses of the runtime. */
export interface StoreRuntime {
	call(method: string, args: readonly unknown[]): CallOutcome;
	views(needs: readonly Need[]): Views;
	/** The replica changed (null) or an event came: the store runs its loop again. Returns the unsubscribe. */
	subscribe(listener: (event: RuntimeEvent | null) => void): () => void;
	readonly log: ActionLog;
}

/** How the store defers a pass: a microtask in the plugin. */
export interface Scheduler {
	microtask(run: () => void): void;
}

export const microtasks: Scheduler = { microtask: (run) => queueMicrotask(run) };

/** The chain of door answers fed back from one message ran past its bound: a failure, with the action log. */
export class ChainTooLong extends Error {
	constructor(
		readonly bound: number,
		readonly dump: string,
	) {
		super(`a message's chain ran past ${bound} steps; the last actions:\n${dump}`);
	}
}
