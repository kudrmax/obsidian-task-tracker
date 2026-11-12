import { restingRect } from "../motion/Motion";
import type { DragPayload, DropResult, DropTarget, Float, HeldOut } from "./DropTarget";

export type { DragOrigin, DragPayload, DropResult, DropTarget, Float, HeldOut, NewTaskPayload, TaskDragPayload, TaskOrigin } from "./DropTarget";

export interface DragSessionOptions<P = DragPayload, R = DropResult> {
	readonly payload: P;
	readonly targets: readonly DropTarget<P, R>[];
	readonly float: Float;
	/** Where the card's place stands now, so a cancelled drag flies back to it. */
	origin(): DOMRect;
	/**
	 * A drag let go nowhere or called off, before its copy flies back: the screen is put back as it stood at the lift (a
	 * held card opened another project), so the copy flies to its place drawn again; the screen stays the drag's until it
	 * is. Null: nothing to put back, the screen is free at once. Never rejects.
	 */
	beforeReturn?(): Promise<void> | null;
	/**
	 * The finger let go, or the drag was called off: the screen is free from now on, so the next gesture starts while the
	 * copy still flies.
	 */
	letGo?(): void;
	/**
	 * The copy has landed, on the task's new place or back on its old one: the place is released and the card shows. A
	 * drag that starts before the copy lands runs it at once (`landNow`), the copy flying on over what is already there.
	 */
	onReturn?(): void;
	/**
	 * The drop, or null for a cancelled drag. A task's drop gives its card once written and drawn: the float lands on it;
	 * or the header its card is held behind, folded away: the float goes into it.
	 */
	onEnd(result: R | null): Promise<HTMLElement | HeldOut | null | void>;
	/** The id of the task it carries: taken up again before the copy lands, the copy gives way to the new one at once. */
	readonly carries?: string;
	/** What it carries has no card of its own to land on (a new task): it lands where the target shows its place. */
	readonly landsOnTarget?: boolean;
	/** Something under the finger failed: said once, and the drag ends as a cancelled one does, nothing left behind. */
	onError?(error: unknown): void;
}

/**
 * One drag from lift to drop, the one end every drag has (a task's card, the plus, a section): it routes the pointer to
 * the target under it; let go, the drop is written and drawn, the copy flies to where what it carries stands now, and
 * only then is the place released; cancelled, the copy flies back first.
 */
export class DragSession<P = DragPayload, R = DropResult> {
	/** The drags let go whose copy has not landed yet. */
	private static readonly landing = new Set<(taking: string | null) => void>();

	/**
	 * A new drag takes the screen: every drag still landing gives back its place and its targets now, so the new one
	 * starts clean. The copy of the task it takes (`taking`, its id) goes at once; any other copy flies on to its place.
	 */
	static landNow(taking: string | null = null): void {
		for (const land of [...DragSession.landing]) land(taking);
	}

	private current: DropTarget<P, R> | null = null;
	private done = false;
	private cut = false;
	private cleared = false;
	private readonly land = (taking: string | null) => {
		this.landed(true);
		if (taking !== null && taking === this.opts.carries) this.opts.float.remove();
	};

	constructor(private readonly opts: DragSessionOptions<P, R>) {}

	/** The targets read the layout first; the float, fixed over everything, is written last, so it moves nothing they measure. */
	move(x: number, y: number): void {
		if (this.done) return;
		try {
			const target = this.opts.targets.find((t) => t.hitTest(x, y, this.opts.payload)) ?? null;
			if (target !== this.current) {
				this.current?.leave();
				this.current = target;
				this.opts.float.rideAbove?.(target?.clearsFinger === true);
			}
			target?.preview(x, y, this.opts.payload);
			this.opts.float.moveTo(x, y);
		} catch (error) {
			this.fail(error);
		}
	}

	async release(x: number, y: number): Promise<void> {
		if (this.done) return;
		let target: DropTarget<P, R> | null = null;
		let result: R | null = null;
		try {
			target = this.current;
			result = target?.drop(x, y, this.opts.payload) ?? null;
		} catch (error) {
			return this.fail(error);
		}
		this.done = true;
		if (!target || !result) return this.settleBack();
		this.opts.letGo?.();
		DragSession.landing.add(this.land);
		try {
			const line = target.landing();
			const card = await this.opts.onEnd(result);
			if (card && !(card instanceof HTMLElement)) await this.opts.float.sink(restingRect(card.behind));
			else {
				const landing = card ? restingRect(card) : this.opts.landsOnTarget ? line : null;
				await (landing ? this.opts.float.land(landing) : this.opts.float.vanish());
			}
		} catch (error) {
			this.opts.onError?.(error);
		} finally {
			this.landed();
			this.opts.float.remove();
		}
	}

	/** A target failed under the finger: said, and the drag ends as a cancelled one, the copy flying back. */
	private fail(error: unknown): Promise<void> {
		this.opts.onError?.(error);
		if (this.done) return Promise.resolve();
		this.done = true;
		return this.settleBack();
	}

	/**
	 * The screen goes away mid-drag (the view closed, the plugin unloaded): the copy goes at once, the targets let go, and
	 * the drag ends as a cancelled one, nothing left on the page.
	 */
	abort(): void {
		this.done = true;
		DragSession.landing.add(this.land);
		this.opts.letGo?.();
		this.landed(true);
		this.opts.float.remove();
		void Promise.resolve(this.opts.onEnd(null)).catch((error: unknown) => this.opts.onError?.(error));
	}

	/** A newer drag took the screen before this one's copy landed: what it still had to draw is not drawn. */
	get interrupted(): boolean {
		return this.cut;
	}

	/** The copy is down, or a new drag cannot wait for it: the place is released and the targets let go, once. */
	private landed(early = false): void {
		if (!DragSession.landing.delete(this.land)) return;
		this.cut = early;
		this.opts.onReturn?.();
		this.clearAll();
	}

	/**
	 * Every target lets the drag go, not only the one under the finger: a list a card was lifted from keeps its place open
	 * while the finger is elsewhere, and stands as it was again only now.
	 */
	private clearAll(): void {
		if (this.cleared) return;
		this.cleared = true;
		this.current = null;
		for (const target of this.opts.targets) target.clear();
	}

	async cancel(): Promise<void> {
		if (this.done) return;
		this.done = true;
		await this.settleBack();
	}

	/**
	 * A cancelled drag: the copy flies back to the card's place first, and only then does the card show there, so the task
	 * is never seen twice. A screen to put back holds the screen until it is drawn: no new drag starts on what it redraws.
	 */
	private async settleBack(): Promise<void> {
		try {
			this.clearAll();
			DragSession.landing.add(this.land);
			const back = this.opts.beforeReturn?.();
			if (back) await back;
			this.opts.letGo?.();
			await this.opts.float.flyTo(this.opts.origin());
		} catch (error) {
			this.opts.letGo?.();
			this.opts.onError?.(error);
		} finally {
			this.landed();
			this.opts.float.remove();
		}
		try {
			await this.opts.onEnd(null);
		} catch (error) {
			this.opts.onError?.(error);
		}
	}
}
