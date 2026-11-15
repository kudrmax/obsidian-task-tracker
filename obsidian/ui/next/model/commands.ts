import type { Outcome } from "./answers";
import type { CarryGeometry } from "./carry";

/**
 * Work a message asks for (P2), as data. `door`: a core call the runtime runs at once, inside the same pass, its outcome
 * fed back as the next message (`reply`, null for none). Every other kind is an effect the host runs after the render,
 * through its drivers; its outcome, if any, comes back later as a message.
 */
export type Command<Msg> =
	| { readonly kind: "door"; readonly method: string; readonly args: readonly unknown[]; readonly reply: (outcome: Outcome) => Msg | null }
	/**
	 * A call of the core's quick entry (`entry.<method>`): the host hands the core the entry's session and the look of the
	 * block as they stand when it runs, then `args`; the answer comes back as `reply`'s message.
	 */
	| { readonly kind: "entryCall"; readonly method: string; readonly args: readonly unknown[]; readonly reply: (answer: unknown) => Msg }
	| { readonly kind: "openLink"; readonly link: { readonly kind: "note" | "url"; readonly target: string } }
	| { readonly kind: "notice"; readonly text: string }
	/** A door call that failed, told in the plugin's one set of words (`failureText`), which the host is given. */
	| { readonly kind: "failure"; readonly error: { readonly code: string; readonly message: string } }
	| { readonly kind: "haptic" }
	/** Focus lands on the field named, inside the user's event (a typing pick, P2). */
	| { readonly kind: "focus"; readonly field: string }
	/** The row of `key` brought into sight in what scrolls it (a found card), `then` told once it is. */
	| { readonly kind: "show"; readonly key: string; readonly then: Msg }
	/** The focus leaves whatever the block holds it in: the keyboard goes away (Done of the full card). */
	| { readonly kind: "blur" }
	/** A message after `ms` (a bound on a wait, a long press), cancelled by `cancelTimer` of the same name or the host's teardown. */
	| { readonly kind: "timer"; readonly name: string; readonly ms: number; readonly msg: Msg }
	| { readonly kind: "cancelTimer"; readonly name: string }
	/** The tasks file in Obsidian's editor, in a new tab, the cursor at the start of line `line` (Open in Obsidian). */
	| { readonly kind: "openTasksFile"; readonly line: number }
	/** An Obsidian modal over the block (the notes to attach): its answer comes back as `pick`. */
	| { readonly kind: "noteSearch"; readonly pick: (link: string) => Msg }
	/** The lists as drawn now measured (rows' boxes, the stack's content pixels) for a carry: the geometry comes back as `measured` (P4). */
	| { readonly kind: "measureCarry"; readonly measured: (geometry: CarryGeometry) => Msg }
	/**
	 * The carried float's flight (P5, a declared transition): onto the row keyed `to` as drawn after this render, or, with
	 * none, fading where it is; `done` once it has ended or was interrupted.
	 */
	| { readonly kind: "fly"; readonly to: string | null; readonly later?: boolean; readonly done: Msg };

export type Commands<Msg> = readonly Command<Msg>[];

/** A door call whose outcome nothing waits for (a write the next view shows). */
export function write<Msg>(method: string, args: readonly unknown[], failed: (error: { readonly code: string; readonly message: string }) => Msg): Command<Msg> {
	return { kind: "door", method, args, reply: (outcome) => (outcome.answer.ok ? null : failed(outcome.answer.error)) };
}
