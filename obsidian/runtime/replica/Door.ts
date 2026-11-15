import { callDoor, type DoorAnswer, type DoorContext } from "../../../core/application/PhoneCalls";
import { ReadingCache } from "../../../core/application/ReadingCache";

export type { DoorAnswer, DoorContext };
export type DoorOk = Extract<DoorAnswer, { ok: true }>;

/** The core's door: a method over a context, answered at once (`docs/door.md`). */
export interface Door {
	call(method: string, args: readonly unknown[], context: DoorContext): DoorAnswer;
}

/**
 * The door in this process, without JSON: the same `callDoor` the iPhone app reaches through JavaScriptCore, with one
 * cache for the whole runtime, so every screen's calls over the same text read it once.
 */
export class InProcessDoor implements Door {
	private readonly cache = new ReadingCache();

	call(method: string, args: readonly unknown[], context: DoorContext): DoorAnswer {
		return callDoor(method, args, context, this.cache);
	}
}

/** The result of an answer that must be ok: a door call the runtime makes for itself and cannot do without. */
export function resultOf<T>(answer: DoorAnswer, method: string): T {
	if (!answer.ok) throw new Error(`${method}: ${answer.error.code} (${answer.error.message})`);
	return answer.result as T;
}
