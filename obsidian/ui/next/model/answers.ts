/**
 * A door's answer as a screen reads it (the core's `DoorAnswer`, by its shape: the screens import the core's contract
 * only): the result, the ids its writes gave; or the error by its code.
 */
export type DoorAnswer =
	| { readonly ok: true; readonly result: unknown; readonly created?: readonly string[] }
	| { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

/** A view answer a screen needs (P2): a door read by its method and arguments, found again in the answers by `key`. */
export interface Need {
	readonly key: string;
	readonly method: string;
	readonly args: readonly unknown[];
}

/** The answers to a screen's needs, by key: the runtime's `Views`, as the model holds them. */
export type Answers = ReadonlyMap<string, DoorAnswer>;

export const NO_ANSWERS: Answers = new Map();

/** The result of the answer under `key`; null while there is none or it failed (a missing file, a stale task). */
export function resultOf<T>(answers: Answers, key: string): T | null {
	const answer = answers.get(key);
	return answer?.ok ? (answer.result as T) : null;
}

/** A door call's outcome as the model reads it: the answer, and whether the call made a pending write. */
export interface Outcome {
	readonly answer: DoorAnswer;
}

/** The result of a call that worked; null for one that failed. */
export function okResult<T>(outcome: Outcome): T | null {
	return outcome.answer.ok ? (outcome.answer.result as T) : null;
}

/** The ids a call's writes gave, in order (`DoorAnswer.created`). */
export function createdBy(outcome: Outcome): readonly string[] {
	return outcome.answer.ok ? (outcome.answer.created ?? []) : [];
}

/** A date as the core writes it, `YYYY-MM-DD`. */
export type LocalDate = string;
