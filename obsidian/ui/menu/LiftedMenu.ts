import { tokenPx } from "../design";
import { el, px } from "../dom";
import { LiftedCopy } from "../kit/LiftedCopy";
import { Panel, Picks } from "../kit/Panel";
import { grownStart, roomWidth, type Size, windowRoom } from "../wholeCard";
import { type CloseHow, Overlay } from "./Overlay";
import { scrollIntoColumn, shownPart, topInside } from "./inView";
import { menuRoom, placePanel } from "./MenuPanel";

/** How the copy over the blur shows what the pressed thing cuts: it grows from `size`, never past `widest`, and answers its new size. */
export type ShowWhole = (copy: HTMLElement, size: Size, widest: number) => Size;

/**
 * What a press on a card or an event opens: a copy of it over the blurred screen, where it stood, grown only as far as
 * its title needs and kept inside the window, and the panel that grows out by it. The task menu and the event menu are
 * made of it; they go together, in the overlay's one fade, and stand at one depth under one shadow.
 */
export abstract class LiftedMenu {
	protected readonly overlay: Overlay;
	/** Every window of the menu picks through these: one pick closes the menu, then acts. */
	protected readonly picks = new Picks(
		() => this.close(),
		() => this.overlay.closed,
	);
	private readonly liftedCopy: LiftedCopy;
	/** Where the copy stands before it is raised. */
	protected copy = new DOMRect();
	/** How far the parts over the blur stand above the pressed thing, to keep a field over the keyboard. */
	protected raisedBy = 0;
	/** Closed before it opened: the column's scroll brought the pressed thing into view for nothing. */
	private gone = false;
	private stopScroll: () => void = () => undefined;

	protected constructor(source: HTMLElement) {
		this.overlay = new Overlay((how) => this.close(how), source);
		this.liftedCopy = LiftedCopy.over(this.overlay, el(null, "div", "tc-lifted"), true);
	}

	/** The menu has closed: what was waited for in it lands nowhere. */
	protected get isClosed(): boolean {
		return this.gone;
	}

	protected get lifted(): HTMLElement {
		return this.liftedCopy.el;
	}

	/**
	 * The menu opens over `source` once it stands in view: its column scrolls to it first, with its own smooth scroll, and
	 * `build` lays out the copy and the panel when the column stands still. A pressed thing that went meanwhile closes it.
	 */
	protected openOver(source: HTMLElement, build: () => void): void {
		this.stopScroll = scrollIntoColumn(source, () => {
			if (this.gone) return;
			if (!source.isConnected) return this.close();
			build();
			this.overlay.show();
		});
	}

	/**
	 * The copy stands over what the column shows of `source`, and what it cuts grows it, kept inside the column's shown
	 * height and the window's width. The panel goes by the copy.
	 */
	protected liftWhole(source: HTMLElement, showWhole: ShowWhole): DOMRect {
		const { rect, box } = shownPart(source);
		const room = windowRoom(this.lifted);
		const size = showWhole(this.lifted, rect, roomWidth(room));
		const left = grownStart(rect.left, rect.width, size.width, room.width, room.margin);
		const top = box ? topInside(rect.top, size.height, box) : grownStart(rect.top, rect.height, size.height, room.height, room.margin);
		this.copy = this.liftedCopy.pin(new DOMRect(left, top, size.width, size.height)).rect;
		return this.copy;
	}

	/** The panel of either menu: the same width and rows. */
	protected addPanel(cls: string): Panel {
		return Panel.over(this.overlay, { root: "tc-panel", cls: `is-menu ${cls}`, picks: this.picks });
	}

	get raised(): number {
		return this.raisedBy;
	}

	/** The copy stands `by` px above where it stood, never below it. */
	raise(by: number): void {
		this.raisedBy = Math.max(0, by);
		this.lifted.style.top = px(this.copy.top - this.raisedBy);
	}

	/** The panel by `anchor`, which never moves; one too tall for either side splits its first groups into `upper`, over it. */
	protected placeBy(panel: HTMLElement, anchor: DOMRect, upper?: HTMLElement, keepAbove?: number): void {
		placePanel(panel, anchor, tokenPx(panel, "--tc-menu-gap"), menuRoom(), upper, keepAbove);
	}

	/** A row's action: the menu closes, then the action runs. */
	protected pick(action: () => void | Promise<void>): () => void {
		return this.picks.pick(action);
	}

	/** A row that opens a field: the menu closes and the field opens in the same tap. */
	protected pickNow(action: () => void | Promise<void>): () => void {
		return this.picks.pickNow(action);
	}

	/** `how`: Escape, or anything else that closed it. */
	close(how: CloseHow = "away"): void {
		this.gone = true;
		this.stopScroll();
		if (this.overlay.isClosed) return;
		void this.overlay.close();
		this.closed(how);
	}

	/** Hears that the menu closed, and how. */
	protected closed(_how: CloseHow): void {}
}
