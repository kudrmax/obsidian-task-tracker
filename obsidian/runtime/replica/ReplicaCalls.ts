import type { ProjectsScreenState } from "../../../core/application/contracts";
import type { DoorAnswer } from "../../../core/application/PhoneCalls";
import type { Door } from "./Door";
import type { PendingCall, PendingLog } from "../persistence/PendingLog";
import { runResolved } from "../persistence/Replay";
import { createdIds } from "./refs";
import type { Replica, ReplicaState } from "./Replica";

/** A call's answer, and the pending call it made when it changed the tasks text (its `seq` names it in a replay's `dropped`). */
export interface CallOutcome {
	readonly answer: DoorAnswer;
	readonly pending: PendingCall | null;
}

/** Where the parts of an answer that outlive the replica go: the tasks text to the writer, the rest to their stores. */
export interface AnswerSinks {
	readonly tasksChanged: () => void;
	readonly settingsChanged: (text: string, handed: string) => void;
	readonly projectsScreenChanged: (state: ProjectsScreenState) => void;
}

/**
 * Door calls over the replica (P3), synchronous and in the order asked. A call's answer is taken at once: its text,
 * history, ids, Projects screen and settings become the replica's, and a call that changed the text enters the pending
 * log with what it read. A read takes nothing.
 */
export class ReplicaCalls {
	constructor(
		private readonly door: Door,
		private readonly replica: Replica,
		private readonly log: PendingLog,
		private readonly now: () => number,
		private readonly sinks: AnswerSinks,
	) {}

	/** A call that may write: its references resolved over the replica, its answer taken. */
	call(method: string, args: readonly unknown[]): CallOutcome {
		const state = this.replica.state;
		const nowMs = this.now();
		const context = this.replica.context(nowMs);
		const answer = runResolved(this.door, { method, args }, context, true);
		if (!answer.ok) return { answer, pending: null };
		const pending = this.logged(state, answer, { method, args, nowMs });
		this.replica.update({
			...(answer.tasks !== undefined && { tasks: answer.tasks }),
			...(answer.history !== undefined && { history: answer.history }),
			...(answer.ids !== undefined && { ids: answer.ids }),
			...(answer.projectsScreen !== undefined && { projectsScreen: answer.projectsScreen }),
		});
		if (answer.projectsScreen !== undefined) this.sinks.projectsScreenChanged(answer.projectsScreen);
		if (answer.settings !== undefined) this.sinks.settingsChanged(answer.settings, state.settings);
		if (answer.tasks !== undefined) this.sinks.tasksChanged();
		return { answer, pending };
	}

	/** A read over the replica: nothing of its answer is taken (views never write; the replica is tidied before). */
	read(method: string, args: readonly unknown[]): DoorAnswer {
		return runResolved(this.door, { method, args }, this.replica.context(this.now()), true);
	}

	/** A change of the text over a file that is there enters the log; the text of a file being created is no call to replay. */
	private logged(state: ReplicaState, answer: Extract<DoorAnswer, { ok: true }>, call: { method: string; args: readonly unknown[]; nowMs: number }): PendingCall | null {
		if (answer.tasks === undefined || state.tasks === null) return null;
		return this.log.append({ ...call, projectsScreen: state.projectsScreen, created: createdIds(state.ids, answer.ids) });
	}
}
