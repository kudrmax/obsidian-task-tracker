import { tokenPx } from "../design";
import { LiftedCopy } from "../kit/LiftedCopy";
import { Panel, Picks } from "../kit/Panel";
import { menuGroup, menuRoom, placePanel } from "./MenuPanel";
import { Overlay } from "./Overlay";

export interface MoreMenuOptions {
	/** The bottom capsule: a copy of it stays over the backdrop, and the panel stands over it, by its left edge. */
	readonly anchor: HTMLElement;
	onSearch(): void;
	onSelect(): void;
}

/** What «⋯» opens over the capsule: Search and Select tasks. */
export class MoreMenu {
	private readonly overlay: Overlay;

	static open(opts: MoreMenuOptions): MoreMenu {
		return new MoreMenu(opts);
	}

	private constructor(opts: MoreMenuOptions) {
		this.overlay = new Overlay(() => this.close());
		const rect = opts.anchor.getBoundingClientRect();
		const copy = LiftedCopy.over(this.overlay, opts.anchor.cloneNode(true) as HTMLElement, false);
		copy.el.classList.add("tc-control-copy");
		copy.pin(rect);
		const panel = Panel.over(this.overlay, { root: "tc-panel", cls: "is-more", picks: new Picks(() => this.close()), place: (p) => placePanel(p, rect, tokenPx(p, "--tc-menu-gap"), menuRoom()) }, false);
		panel.replace((p) =>
			menuGroup(p, [
				{ label: "Search", icon: "search", onPick: panel.pick(() => opts.onSearch()) },
				{ label: "Select tasks", icon: "select", onPick: panel.pick(() => opts.onSelect()) },
			]),
		);
		this.overlay.show();
	}

	close(): void {
		this.overlay.close();
	}
}
