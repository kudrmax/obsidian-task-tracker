import { el } from "../dom";

export type GripEdge = "start" | "end";

export interface GripHandler {
	/** Whether a press on a grip is the grip's now; one that is not goes on as it would. */
	takes(): boolean;
	/** A press taken: it already goes no further and keeps its default. */
	onGrip(edge: GripEdge, e: PointerEvent): void;
}

/** The dots at the ends of a selected timeline card that stretch it. */
export const Grips = {
	attach(parent: HTMLElement, handler: GripHandler): void {
		for (const edge of ["start", "end"] as const) {
			el(parent, "span", `tc-grip is-${edge}`).addEventListener("pointerdown", (e) => {
				if (!e.isPrimary || e.button !== 0 || !handler.takes()) return;
				e.stopPropagation();
				e.preventDefault();
				handler.onGrip(edge, e);
			});
		}
	},
};
