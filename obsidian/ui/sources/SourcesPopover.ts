import type { SourceStatus } from "../../../core/application/contracts";
import { PROPERTY } from "../design";
import { el, px } from "../dom";
import { icon } from "../kit/icons";
import { LiftedCopy } from "../kit/LiftedCopy";
import { Panel, Picks } from "../kit/Panel";
import { menuRow } from "../menu/MenuPanel";
import { Overlay } from "../menu/Overlay";
import { sourceText } from "./sourceText";

export interface SourcesPopoverOptions {
	/** The switch at the bottom; a copy of it stays over the backdrop, and the panel stands over it, centred on it. */
	readonly anchor: HTMLElement;
	readonly statuses: readonly SourceStatus[];
	onRefresh(): Promise<void>;
}

/** The sources window: each calendar with when it was last brought up to date, and Refresh now. */
export class SourcesPopover {
	private readonly overlay: Overlay;

	static open(opts: SourcesPopoverOptions): SourcesPopover {
		return new SourcesPopover(opts);
	}

	private constructor(opts: SourcesPopoverOptions) {
		this.overlay = new Overlay(() => this.close(), opts.anchor);
		const rect = opts.anchor.getBoundingClientRect();
		const copy = LiftedCopy.over(this.overlay, opts.anchor.cloneNode(true) as HTMLElement, false);
		copy.el.classList.add("tc-seg-copy");
		copy.pin(rect);
		const panel = Panel.over(this.overlay, { root: "tc-popover", picks: new Picks(
				() => this.close(),
				() => this.overlay.closed,
			), place: (p) => SourcesPopover.over(p, rect) }, false);
		panel.replace((p) => {
			for (const status of opts.statuses) SourcesPopover.row(p, sourceText(status), status);
			menuRow(p, { label: "Refresh now", icon: "refresh", root: "tc-source-refresh", iconSide: "start", onPick: panel.pick(() => opts.onRefresh()) });
		});
		this.overlay.show();
	}

	/** Over the switch, centred on it. */
	private static over(panel: HTMLElement, rect: DOMRect): void {
		panel.style.left = px(rect.left + rect.width / 2);
		panel.style.setProperty(PROPERTY.panelY, px(activeWindow.innerHeight - rect.top));
	}

	private static row(panel: HTMLElement, text: ReturnType<typeof sourceText>, status: SourceStatus): void {
		const row = el(panel, "div", "tc-source-row");
		row.appendChild(icon(status.source));
		const lines = el(row, "div", "tc-source-lines");
		el(lines, "span", "tc-source-name", text.name);
		el(lines, "span", "tc-source-sub", text.sub);
		const time = el(row, "span", "tc-source-time", text.time);
		time.classList.toggle("is-stale", text.stale);
	}

	close(): void {
		void this.overlay.close();
	}
}
