import { type RepeatRule, sameRule } from "../domain/Repeat";
import { type RepeatDraft, repeatDraft } from "../domain/RepeatDraft";
import type { LocalDate } from "../domain/Task";

/** What the repeat page holds besides the task's own rule: the rule it was changed to, or none (Remove repeat); null untouched. */
export type RepeatHeld = { readonly rule: RepeatRule | null } | null;

/**
 * What the page writes as the menu closes, the task's rule being `own`: the rule it holds, unless that is `own` again; null
 * for nothing. Remove repeat holds none, and the menu closes at once.
 */
export function repeatPageEnd(own: RepeatRule | null, held: RepeatHeld): { readonly rule: RepeatRule | null } | null {
	if (held === null) return null;
	if (held.rule === null) return own === null ? null : held;
	return sameRule(held.rule, own) ? null : held;
}

/**
 * A task menu's repeat page: a change shows on the page at once and is written once, as the menu closes; Remove repeat
 * takes the rule off as the menu closes at once. (The quick entry's panel writes nothing: its session holds the rule.)
 */
export class RepeatPage {
	private held: RepeatHeld = null;

	constructor(
		private readonly task: { readonly repeat: RepeatRule | null; readonly repeatDay: LocalDate },
		private readonly write: (rule: RepeatRule | null) => void,
	) {}

	/** What the page offers and shows first. */
	get draft(): RepeatDraft {
		return repeatDraft(this.task.repeatDay, this.task.repeat);
	}

	change(rule: RepeatRule): void {
		this.held = { rule };
	}

	remove(): void {
		this.held = { rule: null };
	}

	/** The menu closed: what the page holds is written, once. */
	close(): void {
		const end = repeatPageEnd(this.task.repeat, this.held);
		this.held = null;
		if (end) this.write(end.rule);
	}
}
