import type { DragPayload, DropResult, DropTarget, Float } from "./DropTarget";

export type { DragOrigin, DragPayload, DropResult, DropTarget, Float, NewTaskPayload, TaskDragPayload, TaskOrigin } from "./DropTarget";

export interface DragSessionOptions {
	readonly payload: DragPayload;
	readonly targets: readonly DropTarget[];
	readonly float: Float;
	/** Where the card came from, so a cancelled drag flies back. */
	readonly origin: DOMRect;
	/** The card is about to fly back: its place in the list opens again. */
	onReturn?(): void;
	/** The drop, or null for a cancelled drag. */
	onEnd(result: DropResult | null): Promise<void>;
}

/** One drag from lift to drop: routes the pointer to the target under it and settles the card at the end. */
export class DragSession {
	private current: DropTarget | null = null;
	private done = false;
	/** Zones the finger stood on as the card was lifted, which it has not left yet: nothing under them takes the card either. */
	private waiting: readonly DropTarget[] = [];

	constructor(private readonly opts: DragSessionOptions) {}

	/** The finger at the lift: the lists show where the card came from, and the zones under it wait until it leaves them. */
	start(x: number, y: number): void {
		for (const target of this.opts.targets) target.lift?.();
		this.waiting = this.opts.targets.filter((t) => t.waitsForEntry && t.hitTest(x, y, this.opts.payload));
		this.move(x, y);
	}

	move(x: number, y: number): void {
		if (this.done) return;
		this.opts.float.moveTo(x, y);
		this.waiting = this.waiting.filter((t) => t.hitTest(x, y, this.opts.payload));
		const target = this.waiting.length > 0 ? null : (this.opts.targets.find((t) => t.hitTest(x, y, this.opts.payload)) ?? null);
		if (target !== this.current) {
			this.current?.leave();
			this.current = target;
		}
		target?.preview(x, y, this.opts.payload);
	}

	async release(x: number, y: number): Promise<void> {
		if (this.done) return;
		this.done = true;
		const target = this.current;
		const result = target?.drop(x, y, this.opts.payload) ?? null;
		if (!target || !result) return this.settleBack();
		const landing = target.landing() ?? this.opts.origin;
		await Promise.all([this.opts.float.flyTo(landing), this.opts.onEnd(result)]);
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

	private async settleBack(): Promise<void> {
		this.opts.onReturn?.();
		this.clearAll();
		await this.opts.float.flyTo(this.opts.origin);
		this.opts.float.remove();
		await this.opts.onEnd(null);
	}
}
