import type { DoorAnswer } from "../../core/application/PhoneCalls";
import type { StoreRuntime } from "./dispatch/Program";
import type { Need, Views } from "./dispatch/ViewAnswers";
import type { RuntimeEvent } from "./events";
import type { ActionLog } from "./lifecycle/ActionLog";
import type { CallOutcome } from "./replica/ReplicaCalls";

/** What a host session reaches of its runtime. */
export interface SessionRuntime {
	readonly log: ActionLog;
	call(method: string, args: readonly unknown[]): CallOutcome;
	read(method: string, args: readonly unknown[]): DoorAnswer;
	views(needs: readonly Need[]): Views;
	subscribe(listener: (event: RuntimeEvent | null) => void): () => void;
	/** Whether a carry is under way in the replica. */
	carrying(): boolean;
	/** The carry under way belongs to `owner`: only its teardown ends it. */
	claimCarry(owner: object): void;
	/** Ends the carry under way if `owner` started it. */
	endCarryOf(owner: object): void;
}

/**
 * The runtime as one host sees it (P8): the leaf, a note's block, the settings tab. Its stores call and subscribe
 * through it; a carry it starts is its own; its teardown ends that carry and every subscription it made, and nothing of
 * another host's.
 */
export class HostSession implements StoreRuntime {
	private readonly subscriptions = new Set<() => void>();

	constructor(private readonly runtime: SessionRuntime) {}

	get log(): ActionLog {
		return this.runtime.log;
	}

	call(method: string, args: readonly unknown[]): CallOutcome {
		const before = this.runtime.carrying();
		const outcome = this.runtime.call(method, args);
		if (!before && this.runtime.carrying()) this.runtime.claimCarry(this);
		return outcome;
	}

	read(method: string, args: readonly unknown[]): DoorAnswer {
		return this.runtime.read(method, args);
	}

	views(needs: readonly Need[]): Views {
		return this.runtime.views(needs);
	}

	subscribe(listener: (event: RuntimeEvent | null) => void): () => void {
		const off = this.runtime.subscribe(listener);
		const once = () => {
			off();
			this.subscriptions.delete(once);
		};
		this.subscriptions.add(once);
		return once;
	}

	/** The host goes away: its carry ends (`endCarry`), and nothing it subscribed to is heard any more. */
	teardown(): void {
		this.runtime.endCarryOf(this);
		[...this.subscriptions].forEach((off) => off());
	}
}
