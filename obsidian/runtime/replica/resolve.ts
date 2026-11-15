import type { DoorAnswer, DoorContext } from "../../../core/application/PhoneCalls";
import type { Door } from "./Door";
import { followSections, GoneSection, namedSections } from "./refs";

/** A call's run: its arguments as they now stand (tasks by their current keys, sections still by ref), and the door's answer. */
export interface ResolvedRun {
	readonly args: readonly unknown[];
	readonly answer: DoorAnswer;
}

/** A call by its method and arguments. */
export interface DoorCall {
	readonly method: string;
	readonly args: readonly unknown[];
}

const stale = (message: string): DoorAnswer => ({ ok: false, error: { code: "staleTask", message } });

/** The arguments with each section ref named as the file has it now (`tasks.sectionOf`); null when one is gone. */
function named(door: Door, args: readonly unknown[], context: DoorContext): readonly unknown[] | GoneSection {
	try {
		return namedSections(args, (id) => {
			const answer = door.call("tasks.sectionOf", [id], context);
			return answer.ok ? ((answer.result as { readonly name: string } | null)?.name ?? null) : null;
		});
	} catch (e) {
		if (e instanceof GoneSection) return e;
		throw e;
	}
}

/** The call run with `args` as they are (sections named): its answer. */
function runAsIs(door: Door, call: DoorCall, args: readonly unknown[], context: DoorContext): DoorAnswer {
	const ready = named(door, args, context);
	return ready instanceof GoneSection ? stale(ready.message) : door.call(call.method, ready, context);
}

/**
 * A call over a file changed since it was made (a replay): its ids mapped through `idMap` and every task's key made
 * current by the door (`tasks.freshArgs`), then run. A task or section gone is a stale task.
 */
export function runFresh(door: Door, call: DoorCall, context: DoorContext, idMap: ReadonlyMap<string, string> = new Map()): ResolvedRun {
	const fresh = door.call("tasks.freshArgs", [followSections(call.args, idMap), Object.fromEntries(idMap)], context);
	if (!fresh.ok) return { args: call.args, answer: fresh };
	const args = fresh.result as readonly unknown[];
	return { args, answer: runAsIs(door, call, args, context) };
}

/**
 * A call over the replica as it stands: run as made, since the door finds a task by its key's id wherever the
 * replica's own writes moved it; only a stale answer (its line changed elsewhere, Sync) is run again with its keys made
 * current (`runFresh`). One door call on the common path.
 */
export function runNow(door: Door, call: DoorCall, context: DoorContext): ResolvedRun {
	const answer = runAsIs(door, call, call.args, context);
	if (answer.ok || answer.error.code !== "staleTask") return { args: call.args, answer };
	return runFresh(door, call, context);
}

/** The ids an answer's writes gave anew, in the order given (`DoorAnswer.created`). */
export function createdBy(answer: DoorAnswer): readonly string[] {
	return answer.ok ? (answer.created ?? []) : [];
}
