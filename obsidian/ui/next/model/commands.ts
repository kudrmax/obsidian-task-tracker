import type { Outcome } from "./answers";

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
	/** A message after `ms` (a bound on a wait, a long press), cancelled by `cancelTimer` of the same name or the host's teardown. */
	| { readonly kind: "timer"; readonly name: string; readonly ms: number; readonly msg: Msg }
	| { readonly kind: "cancelTimer"; readonly name: string }
	/** An Obsidian modal over the block (the notes to attach): its answer comes back as `pick`. */
	| { readonly kind: "noteSearch"; readonly pick: (link: string) => Msg };

export type Commands<Msg> = readonly Command<Msg>[];

/** A door call whose outcome nothing waits for (a write the next view shows). */
export function write<Msg>(method: string, args: readonly unknown[], failed: (error: { readonly code: string; readonly message: string }) => Msg): Command<Msg> {
	return { kind: "door", method, args, reply: (outcome) => (outcome.answer.ok ? null : failed(outcome.answer.error)) };
}
