import { clear, el } from "../dom";
import type { Overlay } from "../menu/Overlay";
import { PanelPages } from "../menu/PanelPages";

/** What a window is drawn as: a menu's panel, the sources window, the start of a description. */
export type PanelRoot = "tc-panel" | "tc-popover" | "tc-desc-peek";

/**
 * A window's picks: the first closes what it stands in, and acts once the close has ended, so what it does happens on
 * the screen under it, never under its fading copy; any pick after it, while that closes, does nothing. One that opens
 * a field acts inside the tap itself (`pickNow`): iOS raises the keyboard only for a field focused by the finger's own tap.
 */
export class Picks {
	private picked = false;

	/** `closed` resolves once the window has gone, null when it has gone already; without it the pick acts at once. */
	constructor(
		private readonly close: () => void,
		private readonly closed: () => Promise<void> | null = () => null,
	) {}

	pick(then: () => void | Promise<void>): () => void {
		return () => {
			if (this.picked) return;
			this.picked = true;
			this.close();
			const closing = this.closed();
			if (closing) void closing.then(then);
			else void then();
		};
	}

	/** A pick that types: the window closes and the field opens in the same tap. */
	pickNow(then: () => void | Promise<void>): () => void {
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

	private readonly pages: PanelPages;

	private constructor(element: HTMLElement, private readonly spec: PanelSpec) {
		this.el = element;
		this.pages = new PanelPages(() => [element]);
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

	pickNow(then: () => void | Promise<void>): () => void {
		return this.spec.picks.pickNow(then);
	}

	/**
	 * Another page of the window in its place: what it showed goes, `build` lays out the new one, and it is placed again;
	 * the window grows or shrinks to it and the page `name` keeps its own scroll.
	 */
	replace(build: (panel: HTMLElement) => void, name = "page"): void {
		this.pages.show(name, () => {
			clear(this.el);
			build(this.el);
			this.place();
		});
	}
}
