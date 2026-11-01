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

	constructor(private readonly opts: DragSessionOptions) {}

	move(x: number, y: number): void {
		if (this.done) return;
		this.opts.float.moveTo(x, y);
		const target = this.opts.targets.find((t) => t.hitTest(x, y, this.opts.payload)) ?? null;
		if (target !== this.current) {
			this.current?.clear();
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
	 * Every target lets the drag go, not only the one under the finger: a list a card was lifted from keeps its room closed
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
