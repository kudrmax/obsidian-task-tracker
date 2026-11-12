import type { ViewMode, ViewModeOption } from "../../../core/application/contracts";
import { tokenPx } from "../design";
import { el } from "../dom";
import { LiftedCopy } from "../kit/LiftedCopy";
import { Panel } from "../kit/Panel";
import { menuGroup, menuRoom, placePanel } from "./MenuPanel";
import { Overlay } from "./Overlay";

export interface ViewMenuOptions {
	/** The view button: a copy of it stays over the backdrop, and the panel stands over it, centred on it. */
	readonly anchor: HTMLElement;
	readonly modes: readonly ViewModeOption[];
	onPick(mode: ViewMode): void;
}

/** The view button's menu (board V1DeskCols): «View» over the modes the core offers, the current one checked. */
export class ViewMenu {
	private readonly overlay: Overlay;

	static open(opts: ViewMenuOptions): ViewMenu {
		return new ViewMenu(opts);
	}

	private constructor(opts: ViewMenuOptions) {
		this.overlay = new Overlay(() => this.close(), opts.anchor);
		const rect = opts.anchor.getBoundingClientRect();
		const copy = LiftedCopy.over(this.overlay, opts.anchor.cloneNode(true) as HTMLElement, false);
		copy.el.classList.add("tc-control-copy");
		copy.pin(rect);
		const panel = Panel.over(
			this.overlay,
			{
				root: "tc-panel",
				cls: "is-view",
				place: (p) => placePanel(p, new DOMRect(rect.left + (rect.width - p.offsetWidth) / 2, rect.top, p.offsetWidth, rect.height), tokenPx(p, "--tc-menu-gap"), menuRoom()),
			},
			false,
		);
		panel.replace((p) => {
			el(p, "div", "tc-menu-title", "View");
			menuGroup(
				p,
				opts.modes.map((option) => ({ label: option.label, icon: option.checked ? ("check" as const) : undefined, choice: true, onPick: panel.pick(() => opts.onPick(option.mode)) })),
			);
		});
		this.overlay.show();
	}

	close(): void {
		void this.overlay.close();
	}
}
