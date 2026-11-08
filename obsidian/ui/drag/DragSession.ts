import { restingRect } from "../motion/Motion";
import type { DragPayload, DropResult, DropTarget, Float } from "./DropTarget";

export type { DragOrigin, DragPayload, DropResult, DropTarget, Float, NewTaskPayload, TaskDragPayload, TaskOrigin } from "./DropTarget";

export interface DragSessionOptions<P = DragPayload, R = DropResult> {
	readonly payload: P;
	readonly targets: readonly DropTarget<P, R>[];
	readonly float: Float;
	/** Where the card's place stands now, so a cancelled drag flies back to it. */
	origin(): DOMRect;
	/** The copy has landed, on the task's new place or back on its old one: the place is released and the card shows. */
	onReturn?(): void;
	/** The drop, or null for a cancelled drag. A task's drop gives its card once written and drawn: the float lands on it. */
	onEnd(result: R | null): Promise<HTMLElement | null | void>;
	/** What it carries has no card of its own to land on (a new task): it lands where the target shows its place. */
	readonly landsOnTarget?: boolean;
}

/**
 * One drag from lift to drop, the one end every drag has (a task's card, the plus, a section): it routes the pointer to
 * the target under it; let go, the drop is written and drawn, the copy flies to where what it carries stands now, and
 * only then is the place released; cancelled, the copy flies back first.
 */
export class DragSession<P = DragPayload, R = DropResult> {
	private current: DropTarget<P, R> | null = null;
	private done = false;

	constructor(private readonly opts: DragSessionOptions<P, R>) {}

	/** The targets read the layout first; the float, fixed over everything, is written last, so it moves nothing they measure. */
	move(x: number, y: number): void {
		if (this.done) return;
		const target = this.opts.targets.find((t) => t.hitTest(x, y, this.opts.payload)) ?? null;
		if (target !== this.current) {
			this.current?.leave();
			this.current = target;
		}
		target?.preview(x, y, this.opts.payload);
		this.opts.float.moveTo(x, y);
	}

	async release(x: number, y: number): Promise<void> {
		if (this.done) return;
		this.done = true;
		const target = this.current;
		const result = target?.drop(x, y, this.opts.payload) ?? null;
		if (!target || !result) return this.settleBack();
		const line = target.landing();
		const card = await this.opts.onEnd(result);
		const landing = card ? restingRect(card) : this.opts.landsOnTarget ? line : null;
		await (landing ? this.opts.float.land(landing) : this.opts.float.vanish());
		this.opts.onReturn?.();
		this.clearAll();
		this.opts.float.remove();
	}

	/**
	 * Every target lets the drag go, not only the one under the finger: a list a card was lifted from keeps its place open
	 * while the finger is elsewhere, and stands as it was again only now.
	 */
	private clearAll(): void {
		this.current = null;
		for (const target of this.opts.targets) target.clear();
	}

	async cancel(): Promise<void> {
		if (this.done) return;
		this.done = true;
		await this.settleBack();
	}

	/** A cancelled drag: the copy flies back to the card's place first, and only then does the card show there, so the task is never seen twice. */
	private async settleBack(): Promise<void> {
		this.clearAll();
		await this.opts.float.flyTo(this.opts.origin());
		this.opts.onReturn?.();
		this.opts.float.remove();
		await this.opts.onEnd(null);
	}
}
