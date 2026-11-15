import type { ProjectsScreenState } from "../../../core/application/contracts";
import type { UndoState } from "../../../core/application/UndoSteps";

/**
 * A call that changed the tasks text and is not yet persisted (P3): its method and arguments (tasks by id, sections by
 * `SectionRef`), the inputs it read besides the text (its moment and the Projects screen it ran over), and the ids its
 * creates gave. `seq` names it for its whole life: the model finds the call a replay dropped by it.
 */
export interface PendingCall {
	readonly seq: number;
	readonly method: string;
	readonly args: readonly unknown[];
	readonly nowMs: number;
	readonly projectsScreen: ProjectsScreenState;
	readonly created: readonly string[];
}

/** What the pending calls are based on: the tasks file's text as last persisted or read, and the undo history that went with it. */
export interface PendingBase {
	readonly text: string | null;
	readonly history?: UndoState;
}

/** The pending calls over their base, in the order Max made them. */
export class PendingLog {
	private calls: PendingCall[] = [];
	private next = 1;
	private current: PendingBase = { text: null };

	get base(): PendingBase {
		return this.current;
	}

	get entries(): readonly PendingCall[] {
		return this.calls;
	}

	get size(): number {
		return this.calls.length;
	}

	/** The seq of the last call in the log, 0 for none: what a write that took the replica's text now includes. */
	get lastSeq(): number {
		return this.calls[this.calls.length - 1]?.seq ?? 0;
	}

	append(call: Omit<PendingCall, "seq">): PendingCall {
		const entry = { ...call, seq: this.next++ };
		this.calls.push(entry);
		return entry;
	}

	/** A new base the file was read at: the calls stay, to be replayed over it. */
	rebase(text: string | null): void {
		this.current = { ...this.current, text };
	}

	/** The calls up to `seq` are in the file now, written as `text` with `history`. */
	persisted(text: string, history: UndoState | undefined, seq: number): void {
		this.current = { text, history };
		this.calls = this.calls.filter((c) => c.seq > seq);
	}

	/** The calls as a replay left them (args mapped to new ids, created ids anew), dropped ones gone. */
	replace(calls: readonly PendingCall[]): void {
		this.calls = [...calls];
	}

	/** Every pending call dropped: the file is taken as it is. Answers them. */
	dropAll(): PendingCall[] {
		const dropped = this.calls;
		this.calls = [];
		return dropped;
	}
}
