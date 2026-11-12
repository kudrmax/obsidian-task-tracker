import { PROJECTS_HOVER_MS } from "../../../core/application/contracts";
import { LAYOUT } from "../design";
import type { DragPayload, DropResult, DropTarget } from "../drag/DropTarget";

export interface EdgeRevealDeps {
	/** The view the edge is the left of. */
	root(): HTMLElement;
	/** The panel can slide out now: the phone, its panel closed. */
	enabled(): boolean;
	/** A card waited at the edge: the panel slides out for this drag. */
	reveal(): void;
}

/**
 * The phone's left edge as a place a held card waits at (board T5): a task's card held there as long as a card waits over
 * a row of the tree slides the projects' panel out, for the drag alone, so the card can be let go on a row. Nothing is
 * let go on the edge itself.
 */
export class EdgeReveal implements DropTarget {
	private timer = 0;

	constructor(private readonly deps: EdgeRevealDeps) {}

	hitTest(x: number, _y: number, drag: DragPayload): boolean {
		if (drag.from === "new" || !this.deps.enabled()) return false;
		return x - this.deps.root().getBoundingClientRect().left < LAYOUT.panelEdge;
	}

	preview(): void {
		if (this.timer) return;
		this.timer = window.setTimeout(() => {
			this.timer = 0;
			if (this.deps.enabled()) this.deps.reveal();
		}, PROJECTS_HOVER_MS);
	}

	landing(): DOMRect | null {
		return null;
	}

	leave(): void {
		window.clearTimeout(this.timer);
		this.timer = 0;
	}

	clear(): void {
		this.leave();
	}

	drop(): DropResult | null {
		this.leave();
		return null;
	}
}
