import { tokenPx } from "../design";
import { el, px } from "../dom";
import { grownStart, roomWidth, type Size, windowRoom } from "../wholeCard";
import { type CloseHow, Overlay } from "./Overlay";
import { menuRoom, placePanel } from "./MenuPanel";

/** How the copy over the blur shows what the pressed thing cuts: it grows from `size`, never past `widest`, and answers its new size. */
export type ShowWhole = (copy: HTMLElement, size: Size, widest: number) => Size;

/**
 * What a press on a card or an event opens: a copy of it over the blurred screen, where it stood, grown only as far as
 * its title needs and kept inside the window, and the panel that grows out by it. The task menu and the event menu are
 * made of it; they go together, in the overlay's one fade.
 */
export abstract class LiftedMenu {
	protected readonly overlay: Overlay;
	protected readonly lifted: HTMLElement;
	/** Where the copy stands before it is raised. */
	protected copy = new DOMRect();
	/** How far the parts over the blur stand above the pressed thing, to keep a field over the keyboard. */
	protected raisedBy = 0;

	protected constructor() {
		this.overlay = new Overlay((how) => this.close(how));
		this.lifted = this.overlay.add(el(null, "div", "tc-lifted"));
	}

	/** The copy stands where `source` does; what it cuts grows it, kept inside the window, and the panel goes by the copy. */
	protected liftWhole(source: DOMRect, showWhole: ShowWhole): DOMRect {
		const room = windowRoom(this.lifted);
		const size = showWhole(this.lifted, source, roomWidth(room));
		const left = grownStart(source.left, source.width, size.width, room.width, room.margin);
		const top = grownStart(source.top, source.height, size.height, room.height, room.margin);
		this.lifted.style.left = px(left);
		this.lifted.style.top = px(top);
		return (this.copy = new DOMRect(left, top, size.width, size.height));
	}

	/** The panel of either menu: the same width and rows. */
	protected addPanel(cls: string): HTMLElement {
		return this.overlay.add(el(null, "div", `tc-panel is-menu ${cls}`));
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
	protected placeBy(panel: HTMLElement, anchor: DOMRect, upper?: HTMLElement): void {
		placePanel(panel, anchor, tokenPx(panel, "--tc-menu-gap"), menuRoom(), upper);
	}

	/** A row's action: the menu closes, then the action runs. */
	protected pick(action: () => void | Promise<void>): () => void {
		return () => {
			this.close();
			void action();
		};
	}

	/** `how`: Escape, or anything else that closed it. */
	close(how: CloseHow = "away"): void {
		if (this.overlay.close()) this.closed(how);
	}

	/** Hears that the menu closed, and how. */
	protected closed(_how: CloseHow): void {}
}
