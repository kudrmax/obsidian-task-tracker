import type { ProjectsScreenState } from "../../../core/application/contracts";
import type { TaskIdState } from "../../../core/application/TaskIdentity";
import type { Door } from "../replica/Door";
import { contextOf, type Replica } from "../replica/Replica";
import { NOTICE_WORDS, type Notices, type RuntimeEvents } from "../events";
import type { PendingCall, PendingLog } from "./PendingLog";
import { replay } from "./Replay";

/**
 * The ids a new base is read with: those that went with the old base (so a task the pending calls name is found by its
 * id), going on from the replica's counter, so no id is ever given twice in the runtime's life.
 */
function baseIds(base: TaskIdState | undefined, now: TaskIdState | undefined): TaskIdState | undefined {
	if (base === undefined || now === undefined || now.next <= base.next) return base ?? now;
	return { ...base, next: now.next };
}

export interface RebaserDeps {
	readonly door: Door;
	readonly replica: Replica;
	readonly log: PendingLog;
	readonly now: () => number;
	readonly events: RuntimeEvents;
	readonly notices: Notices;
	/** The device's Projects screen after a reconciliation: kept where the device keeps it. */
	readonly keepProjectsScreen: (state: ProjectsScreenState) => void;
}

/**
 * A new base for the replica (P3, «Outside changes»): the file's text tidied first (outside the log), then the pending
 * calls replayed over it. Only the text, the history and the ids are taken from the replay; the kept parts (the Projects
 * screen, a carry) are reconciled by the door after a replay that gave new ids or dropped a call.
 */
export class Rebaser {
	constructor(private readonly deps: RebaserDeps) {}

	/** The file was read at `text`: it becomes the base, and the pending calls run again over it. */
	rebase(text: string, dropped: readonly PendingCall[] = []): void {
		const { door, replica, log } = this.deps;
		const start = { ...contextOf(replica.state, this.deps.now()), tasks: text, history: log.base.history, ids: baseIds(log.base.ids, replica.state.ids) };
		const tidy = door.call("tasks.normalize", [], start);
		const tidied = tidy.ok ? { ...start, tasks: tidy.tasks ?? text, ids: tidy.ids ?? start.ids } : start;
		log.rebase(text, tidied.ids);
		const result = replay(door, tidied, log.entries);
		log.replace(result.kept);
		replica.update({ tasks: result.context.tasks, history: result.context.history, ids: result.context.ids });
		if (result.dropped.length > 0) this.deps.notices.show(NOTICE_WORDS.stale);
		this.settle(result.idMap, [...dropped, ...result.dropped]);
	}

	/** Past the bound of replays: the file is taken as it is, and every pending call is dropped. */
	giveUp(text: string): void {
		const dropped = this.deps.log.dropAll();
		if (dropped.length > 0) this.deps.notices.show(NOTICE_WORDS.busy);
		this.rebase(text, dropped);
	}

	/** The file went (moved, deleted, or the settings name another): every pending call is dropped. */
	gone(path: string): void {
		const { log, replica } = this.deps;
		const dropped = log.dropAll();
		log.rebase(null);
		replica.update({ tasks: null });
		if (dropped.length > 0) this.deps.notices.show(NOTICE_WORDS.gone(path));
		this.settle(new Map(), dropped);
		this.deps.events.emit({ kind: "fileGone", path });
	}

	private settle(idMap: ReadonlyMap<string, string>, dropped: readonly PendingCall[]): void {
		if (idMap.size === 0 && dropped.length === 0) return;
		const { door, replica } = this.deps;
		const map = Object.fromEntries(idMap);
		const calls = dropped.map((c) => ({ method: c.method, args: c.args, projectsScreen: c.projectsScreen }));
		const answer = door.call("tasks.reconcile", [map, calls], replica.context(this.deps.now()));
		if (answer.ok && answer.projectsScreen !== undefined) this.deps.keepProjectsScreen(answer.projectsScreen);
		this.deps.events.emit({ kind: "rebased", idMap: map, dropped });
	}
}
