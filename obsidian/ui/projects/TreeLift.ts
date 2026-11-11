import { projectsGap, type ProjectsRow, type TreePlace } from "../../../core/application/contracts";
import { px } from "../dom";
import { windowRoom } from "../wholeCard";
import { DropLine } from "../drag/DropLine";
import { LongPress } from "../drag/LongPress";
import type { GestureArbiter } from "../gestures";
import type { Haptics } from "../haptics";
import { showGapLine, treeGap, type TreeShown } from "./ProjectDrops";

export interface TreeLiftDeps {
	readonly arbiter: GestureArbiter;
	readonly haptics: Haptics;
	longPressMs(): number;
	tree(): TreeShown | null;
	/** The project let go at `place`: reordered, nested or taken out a level (`TaskService.moveProject`). */
	onMove(name: string, place: TreePlace): void;
}

const LIFT = "project-lift";

/**
 * A project of the tree held and carried, to reorder it or nest it (spec: «долгое нажатие переставляет; бросок со сдвигом
 * вправо вкладывает»): its row rides below the finger (the stylesheet moves it), so the drop line and the row it would nest under stay seen, the drop line shows the gap and the depth the finger's distance from
 * the left picks, its own branch left out; let go, it goes there.
 */
export class TreeLift {
	constructor(private readonly deps: TreeLiftDeps) {}

	attach(row: HTMLElement, model: ProjectsRow, signal: AbortSignal): void {
		if (!model.canLift) return;
		LongPress.attach(row, {
			delayMs: () => this.deps.longPressMs(),
			busy: () => this.deps.arbiter.busy,
			onStart: (e) => this.lift(row, model, e),
			signal,
		});
	}

	private lift(row: HTMLElement, model: ProjectsRow, e: PointerEvent): void {
		const tree = this.deps.tree();
		if (!tree || !this.deps.arbiter.claim(LIFT)) return;
		this.deps.haptics.tap();
		const doc = row.ownerDocument;
		const rect = row.getBoundingClientRect();
		const float = row.cloneNode(true) as HTMLElement;
		float.classList.add("tc-tree-float");
		float.style.width = px(rect.width);
		doc.body.appendChild(float);
		const grab = { x: e.clientX - rect.left, y: e.clientY - rect.top };
		const line = new DropLine(() => tree.el);
		/** The row stays inside the window, as a carried card does. */
		const margin = windowRoom(row).margin;
		row.classList.add("is-lifted");
		let at: { readonly gap: number; readonly depth: number } | null = null;
		const move = (x: number, y: number): void => {
			float.style.transform = `translate3d(${px(Math.max(margin, Math.min(window.innerWidth - margin - rect.width, x - grab.x)))}, ${px(y)}, 0)`;
			at = treeGap(tree, x, y, model.node, { depth: model.depth, x: e.clientX });
			if (at) showGapLine(line, tree, at.gap, at.depth, null);
			else line.hide();
		};
		const moved = (m: PointerEvent): void => move(m.clientX, m.clientY);
		const end = (keep: boolean): void => {
			doc.removeEventListener("pointermove", moved);
			doc.removeEventListener("pointerup", up);
			doc.removeEventListener("pointercancel", cancel);
			float.remove();
			line.hide();
			row.classList.remove("is-lifted");
			this.deps.arbiter.release(LIFT);
			if (keep && at) this.deps.onMove(model.title, projectsGap(tree.rows, at.gap, at.depth, model.node).place);
		};
		const up = (): void => end(true);
		const cancel = (): void => end(false);
		doc.addEventListener("pointermove", moved);
		doc.addEventListener("pointerup", up);
		doc.addEventListener("pointercancel", cancel);
		move(e.clientX, e.clientY);
	}
}
