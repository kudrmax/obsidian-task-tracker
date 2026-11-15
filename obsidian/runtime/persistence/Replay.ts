import type { DoorContext } from "../../../core/application/PhoneCalls";
import type { Door } from "../replica/Door";
import { createdBy, runFresh } from "../replica/resolve";
import type { PendingCall } from "./PendingLog";

/** What a replay leaves: the text, history and ids it ends with, the calls kept and dropped, and old id → new id. */
export interface ReplayResult {
	readonly context: DoorContext;
	readonly kept: readonly PendingCall[];
	readonly dropped: readonly PendingCall[];
	readonly idMap: ReadonlyMap<string, string>;
}

/**
 * The ids a call gave the first time paired with those its replay gave, old → new: in order, and only when it gave as
 * many, so an id is never mapped to a line of another kind (a section's to a task's); a pair that did not change is left out.
 */
export function pairCreated(before: readonly string[], now: readonly string[]): [string, string][] {
	if (before.length !== now.length) return [];
	return before.flatMap((old, i) => (now[i] === old ? [] : [[old, now[i]] as [string, string]]));
}

/**
 * The pending calls run again, in order, over `start` (a new base, tidied): each with its own moment and the Projects
 * screen it ran over, the settings as they are now; its ids mapped through those earlier creates gave anew and its tasks
 * found by id. A call that now fails is dropped. Only the text, the history and the ids come out of it (P3).
 */
export function replay(door: Door, start: DoorContext, calls: readonly PendingCall[]): ReplayResult {
	let context = start;
	const kept: PendingCall[] = [];
	const dropped: PendingCall[] = [];
	const idMap = new Map<string, string>();
	for (const call of calls) {
		const over: DoorContext = { ...context, nowMs: call.nowMs, projectsScreen: call.projectsScreen };
		const { args, answer } = runFresh(door, call, over, idMap);
		if (!answer.ok) {
			dropped.push(call);
			continue;
		}
		const created = createdBy(answer);
		pairCreated(call.created, created).forEach(([old, now]) => idMap.set(old, now));
		context = {
			...context,
			tasks: answer.tasks ?? context.tasks,
			history: answer.history ?? context.history,
			ids: answer.ids ?? context.ids,
		};
		kept.push({ ...call, args, created });
	}
	return { context, kept, dropped, idMap };
}
