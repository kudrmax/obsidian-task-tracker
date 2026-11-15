import type { TaskKey } from "../../../core/application/contracts";
import type { DoorAnswer, DoorContext } from "../../../core/application/PhoneCalls";
import type { Door } from "../replica/Door";
import { createdIds, GoneRef, mapIds, type RefResolver, resolveRefs } from "../replica/refs";
import type { PendingCall } from "./PendingLog";

/** What a replay leaves: the text, history and ids it ends with, the calls kept and dropped, and old id → new id. */
export interface ReplayResult {
	readonly context: DoorContext;
	readonly kept: readonly PendingCall[];
	readonly dropped: readonly PendingCall[];
	readonly idMap: ReadonlyMap<string, string>;
}

/** Each reference of a call resolved over the text as the call is about to run on it. */
export function resolverOver(door: Door, context: DoorContext): RefResolver {
	const ask = (method: string, id: string): unknown => {
		const answer = door.call(method, [id], context);
		return answer.ok ? answer.result : null;
	};
	return {
		key: (id) => ask("tasks.keyOf", id) as TaskKey | null,
		section: (id) => (ask("tasks.sectionOf", id) as { readonly name: string } | null)?.name ?? null,
	};
}

/** The door's answer to a call over `context`, its references resolved first; a reference gone is a stale task. */
export function runResolved(door: Door, call: { readonly method: string; readonly args: readonly unknown[] }, context: DoorContext, keys: boolean): DoorAnswer {
	let args: readonly unknown[];
	try {
		args = resolveRefs(call.args, resolverOver(door, context), keys);
	} catch (e) {
		if (e instanceof GoneRef) return { ok: false, error: { code: "staleTask", message: e.message } };
		throw e;
	}
	return door.call(call.method, args, context);
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
		const args = mapIds(call.args, idMap);
		const over: DoorContext = { ...context, nowMs: call.nowMs, projectsScreen: call.projectsScreen };
		const answer = runResolved(door, { method: call.method, args }, over, true);
		if (!answer.ok) {
			dropped.push(call);
			continue;
		}
		const created = createdIds(context.ids, answer.ids);
		call.created.forEach((old, i) => {
			if (created[i] !== undefined && created[i] !== old) idMap.set(old, created[i]);
		});
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
