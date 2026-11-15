import type { DoorAnswer, DoorContext } from "../../../core/application/PhoneCalls";
import type { Door } from "../replica/Door";
import { followSections, GoneSection, namedSections } from "../replica/refs";
import type { PendingCall } from "./PendingLog";

/** What a replay leaves: the text, history and ids it ends with, the calls kept and dropped, and old id → new id. */
export interface ReplayResult {
	readonly context: DoorContext;
	readonly kept: readonly PendingCall[];
	readonly dropped: readonly PendingCall[];
	readonly idMap: ReadonlyMap<string, string>;
}

/** A call's run: its arguments as they now stand (tasks by their current keys, sections still by ref), and the door's answer. */
export interface ResolvedRun {
	readonly args: readonly unknown[];
	readonly answer: DoorAnswer;
}

const stale = (message: string): DoorAnswer => ({ ok: false, error: { code: "staleTask", message } });

/**
 * The door's answer to a call over `context`: its ids mapped through `idMap` and its tasks' keys made current by the door
 * (`tasks.freshArgs`), its section refs named (`tasks.sectionOf`). A task or section gone is a stale task.
 */
export function runResolved(door: Door, call: { readonly method: string; readonly args: readonly unknown[] }, context: DoorContext, idMap: ReadonlyMap<string, string> = new Map()): ResolvedRun {
	const followed = followSections(call.args, idMap);
	const fresh = door.call("tasks.freshArgs", [followed, Object.fromEntries(idMap)], context);
	if (!fresh.ok) return { args: call.args, answer: fresh };
	const args = fresh.result as readonly unknown[];
	let named: readonly unknown[];
	try {
		named = namedSections(args, (id) => {
			const answer = door.call("tasks.sectionOf", [id], context);
			return answer.ok ? ((answer.result as { readonly name: string } | null)?.name ?? null) : null;
		});
	} catch (e) {
		if (e instanceof GoneSection) return { args, answer: stale(e.message) };
		throw e;
	}
	return { args, answer: door.call(call.method, named, context) };
}

/** The ids an answer's writes gave anew, in the order given (`DoorAnswer.created`). */
export function createdBy(answer: DoorAnswer): readonly string[] {
	return answer.ok ? (answer.created ?? []) : [];
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
		const { args, answer } = runResolved(door, call, over, idMap);
		if (!answer.ok) {
			dropped.push(call);
			continue;
		}
		const created = createdBy(answer);
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
