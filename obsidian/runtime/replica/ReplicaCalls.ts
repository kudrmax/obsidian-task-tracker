import type { ProjectsScreenState } from "../../../core/application/contracts";
import type { DoorAnswer } from "../../../core/application/PhoneCalls";
import type { PendingCall, PendingLog } from "../persistence/PendingLog";
import type { Door } from "./Door";
import type { Replica, ReplicaState } from "./Replica";
import { createdBy, runNow } from "./resolve";

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

type Ok = Extract<DoorAnswer, { ok: true }>;

/**
 * Door calls over the replica (P3), synchronous and in the order asked. Every answer is taken at once, a read's as a
 * call's: its text, history, ids, Projects screen and settings become the replica's and are kept where each is kept. A
 * call that changed the text, or changed the undo steps while calls are pending, enters the pending log with what it
 * read; with nothing pending, steps changed alone are the base's. A read is never logged.
 */
export class ReplicaCalls {
	constructor(
		private readonly door: Door,
		private readonly replica: Replica,
		private readonly log: PendingLog,
		private readonly now: () => number,
		private readonly sinks: AnswerSinks,
	) {}

	/** A call that may write: run over the replica now, its answer taken and logged. */
	call(method: string, args: readonly unknown[]): CallOutcome {
		return this.run(method, args, true);
	}

	/** A read (a view, a fact): run and taken like a call, never logged. */
	read(method: string, args: readonly unknown[]): DoorAnswer {
		return this.run(method, args, false).answer;
	}

	private run(method: string, args: readonly unknown[], logs: boolean): CallOutcome {
		const state = this.replica.state;
		const nowMs = this.now();
		const { answer } = runNow(this.door, { method, args }, this.replica.context(nowMs));
		if (!answer.ok) return { answer, pending: null };
		const pending = logs ? this.logged(state, answer, { method, args, nowMs }) : null;
		this.take(state, answer);
		return { answer, pending };
	}

	private take(state: ReplicaState, answer: Ok): void {
		this.replica.update({
			...(answer.tasks !== undefined && { tasks: answer.tasks }),
			...(answer.history !== undefined && { history: answer.history }),
			...(answer.ids !== undefined && { ids: answer.ids }),
			...(answer.projectsScreen !== undefined && { projectsScreen: answer.projectsScreen }),
		});
		if (answer.projectsScreen !== undefined) this.sinks.projectsScreenChanged(answer.projectsScreen);
		if (answer.settings !== undefined) this.sinks.settingsChanged(answer.settings, state.settings);
		if (answer.tasks !== undefined) this.sinks.tasksChanged();
	}

	/** The pending call a call made, if any; the undo steps it changed alone, with nothing pending, kept as the base's. */
	private logged(state: ReplicaState, answer: Ok, call: { method: string; args: readonly unknown[]; nowMs: number }): PendingCall | null {
		if (state.tasks === null) return null;
		const steps = answer.tasks === undefined && answer.history !== undefined;
		if (steps && this.log.size === 0) {
			this.log.keepHistory(answer.history);
			return null;
		}
		if (answer.tasks === undefined && !steps) return null;
		return this.log.append({ ...call, projectsScreen: state.projectsScreen, created: createdBy(answer) });
	}
}
