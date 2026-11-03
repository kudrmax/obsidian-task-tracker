/** The parts of the screen drawn on their own: the columns' frame, the tasks' cards, the calendar's events. */
export type ScreenPart = "frame" | "tasks" | "events";

export interface ScreenPartsDeps {
	/** A gesture holds elements of the screen: nothing is drawn under it. */
	busy(): boolean;
	draw(parts: ReadonlySet<ScreenPart>): void;
}

/** The parts asked to be drawn: at once, or, while a gesture holds the screen, all together once it lets go. */
export class ScreenParts {
	private readonly waiting = new Set<ScreenPart>();

	constructor(private readonly deps: ScreenPartsDeps) {}

	request(...parts: ScreenPart[]): void {
		for (const part of parts) this.waiting.add(part);
		if (!this.deps.busy()) this.flush();
	}

	/** The screen is free again: what waited is drawn in one go. */
	flush(): void {
		if (this.waiting.size === 0) return;
		const parts = new Set(this.waiting);
		this.waiting.clear();
		this.deps.draw(parts);
	}
}
