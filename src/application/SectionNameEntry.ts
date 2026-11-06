/**
 * A section's name typed in place: in place of its header, or under a card that waits for its new section. Enter gives
 * the name as typed, which the service trims and reads; Escape and a tap elsewhere give nothing, so the old name stays.
 * Unlike a task's field, where a tap elsewhere keeps what was typed (QuickEntrySession). It ends once: what comes after
 * the end (the blur of the field taken away) means nothing.
 */
export class SectionNameEntry {
	private ended = false;

	constructor(private readonly onEnd: (name: string | null) => void) {}

	enter(text: string): void {
		this.end(text);
	}

	escape(): void {
		this.end(null);
	}

	blur(): void {
		this.end(null);
	}

	private end(name: string | null): void {
		if (this.ended) return;
		this.ended = true;
		this.onEnd(name);
	}
}
