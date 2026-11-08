import { tokenPx } from "../design";
import { LiftedCopy } from "../kit/LiftedCopy";
import { Panel } from "../kit/Panel";
import { menuGroup, menuRoom, placePanel } from "./MenuPanel";
import { type CloseHow, Overlay } from "./Overlay";

export interface MoreMenuOptions {
	/** The bottom capsule: a copy of it stays over the backdrop, and the panel stands over it, by its left edge. */
	readonly anchor: HTMLElement;
	/** Search: its window takes over the sheet «⋯» stands on (`sheet` gives it), so one sheet stays under both. */
	onSearch(sheet: (onClose: (how: CloseHow) => void) => Overlay): void;
	onSelect(): void;
}

/** What «⋯» opens over the capsule: Search and Select tasks. */
export class MoreMenu {
	private readonly overlay: Overlay;

	static open(opts: MoreMenuOptions): MoreMenu {
		return new MoreMenu(opts);
	}

	private constructor(opts: MoreMenuOptions) {
		this.overlay = new Overlay(() => this.close(), opts.anchor);
		const rect = opts.anchor.getBoundingClientRect();
		const copy = LiftedCopy.over(this.overlay, opts.anchor.cloneNode(true) as HTMLElement, false);
		copy.el.classList.add("tc-control-copy");
		copy.pin(rect);
		const panel = Panel.over(this.overlay, { root: "tc-panel", cls: "is-more", place: (p) => placePanel(p, rect, tokenPx(p, "--tc-menu-gap"), menuRoom()) }, false);
		panel.replace((p) =>
			menuGroup(p, [
				{ label: "Search", icon: "search", onPick: this.overlay.picks.handOff(() => opts.onSearch((onClose) => this.overlay.handOver(onClose))) },
				{ label: "Select tasks", icon: "select", onPick: panel.pick(() => opts.onSelect()) },
			]),
		);
		this.overlay.show();
	}

	close(): void {
		void this.overlay.close();
	}
}
