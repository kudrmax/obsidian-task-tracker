import { clear, el } from "../dom";
import type { Overlay } from "../menu/Overlay";

/** What a window is drawn as: a menu's panel, the sources window, the start of a description. */
export type PanelRoot = "tc-panel" | "tc-popover" | "tc-desc-peek";

/** A window's picks: the first closes what it stands in, then acts; any pick after it, while that closes, does nothing. */
export class Picks {
	private picked = false;

	constructor(private readonly close: () => void) {}

	pick(then: () => void | Promise<void>): () => void {
		return () => {
			if (this.picked) return;
			this.picked = true;
			this.close();
			void then();
		};
	}
}

export interface PanelSpec {
	readonly root: PanelRoot;
	/** The window's own classes besides its root. */
	readonly cls?: string;
	/** Shared by every window of one menu: one pick closes them all. */
	readonly picks: Picks;
	/** Stands the window by what it belongs to, once it is built. */
	readonly place?: (panel: HTMLElement) => void;
}

/** A window over the screen: built in place, placed by what it belongs to, closed by a pick before the pick acts. */
export class Panel {
	readonly el: HTMLElement;

	/** Over an overlay's sheet: it shows and goes with the overlay; on its level, at the depth of the parts there. */
	static over(overlay: Overlay, spec: PanelSpec, onLevel = true): Panel {
		return new Panel(overlay.add(Panel.make(spec), onLevel), spec);
	}

	/** In `holder`, with no sheet: its owner shows it and takes it away. */
	static inside(holder: HTMLElement, spec: PanelSpec): Panel {
		const panel = Panel.make(spec);
		holder.appendChild(panel);
		return new Panel(panel, spec);
	}

	private static make(spec: PanelSpec): HTMLElement {
		return el(null, "div", spec.cls ? `${spec.root} ${spec.cls}` : spec.root);
	}

	private constructor(element: HTMLElement, private readonly spec: PanelSpec) {
		this.el = element;
	}

	/** Grows in: laid out shrunk first, so the growth starts there. A window over an overlay is shown by it instead. */
	show(): void {
		this.el.getBoundingClientRect();
		this.el.classList.add("is-shown");
	}

	place(): void {
		this.spec.place?.(this.el);
	}

	pick(then: () => void | Promise<void>): () => void {
		return this.spec.picks.pick(then);
	}

	/** Another page of the window in its place: what it showed goes, `build` lays out the new one, and it is placed again. */
	replace(build: (panel: HTMLElement) => void): void {
		clear(this.el);
		build(this.el);
		this.place();
	}
}
