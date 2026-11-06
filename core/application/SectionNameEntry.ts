/** What ends a section's name typed in place: Enter, Escape, or a tap elsewhere. */
export type SectionNameEvent = "enter" | "escape" | "blur";

/**
 * The end a key or a tap makes, the entry `ended` before or not: Enter gives the name as typed, which the service trims and
 * reads; Escape and a tap elsewhere give nothing, so the old name stays. Unlike a task's field, where a tap elsewhere keeps
 * what was typed. It ends once: what comes after the end (the blur of the field taken away) means nothing (`end` undefined).
 */
export function sectionNameEnd(ended: boolean, event: SectionNameEvent, text: string): { readonly ended: true; readonly end?: { readonly name: string | null } } {
	if (ended) return { ended: true };
	return { ended: true, end: { name: event === "enter" ? text : null } };
}

/** A section's name typed in place: in place of its header, or under a card that waits for its new section. */
export class SectionNameEntry {
	private ended = false;

	constructor(private readonly onEnd: (name: string | null) => void) {}

	enter(text: string): void {
		this.end("enter", text);
	}

	escape(): void {
		this.end("escape", "");
	}

	blur(): void {
		this.end("blur", "");
	}

	private end(event: SectionNameEvent, text: string): void {
		const next = sectionNameEnd(this.ended, event, text);
		this.ended = next.ended;
		if (next.end) this.onEnd(next.end.name);
	}
}
