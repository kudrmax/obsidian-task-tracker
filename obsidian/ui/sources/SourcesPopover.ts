import type { DayWords, SourceStatus } from "../../../core/application/contracts";
import { PROPERTY } from "../design";
import { el, px } from "../dom";
import { icon } from "../kit/icons";
import { LiftedCopy } from "../kit/LiftedCopy";
import { Panel } from "../kit/Panel";
import { menuRow } from "../menu/MenuPanel";
import { Overlay } from "../menu/Overlay";
import { labelMark } from "./labelMark";

export interface SourcesPopoverOptions {
	/** The switch at the bottom; a copy of it stays over the backdrop, and the panel stands over it, centred on it. */
	readonly anchor: HTMLElement;
	readonly statuses: readonly SourceStatus[];
	/** The day's words: the heading over the rows not in use. */
	readonly words: DayWords;
	onRefresh(): Promise<void>;
}

/**
 * The sources window: each calendar with when it was last brought up to date, and Refresh now. Each row is drawn by its
 * tone, ready from the core: the rows the screen takes calendars from first, then under «Not in use» the spare ones, muted.
 */
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
		const panel = Panel.over(this.overlay, { root: "tc-popover", place: (p) => SourcesPopover.over(p, rect) }, false);
		panel.replace((p) => {
			let captioned = false;
			for (const status of opts.statuses) {
				const spare = status.tone === "spare";
				if (spare && !captioned) el(p, "div", "tc-source-caption", opts.words.notInUse);
				captioned ||= spare;
				SourcesPopover.row(p, status);
			}
			menuRow(p, { label: "Refresh now", icon: "refresh", root: "tc-source-refresh", iconSide: "start", onPick: panel.pick(() => opts.onRefresh()) });
		});
		this.overlay.show();
	}

	/** Over the switch, centred on it. */
	private static over(panel: HTMLElement, rect: DOMRect): void {
		panel.style.left = px(rect.left + rect.width / 2);
		panel.style.setProperty(PROPERTY.panelY, px(activeWindow.innerHeight - rect.top));
	}

	private static row(panel: HTMLElement, status: SourceStatus): void {
		const text = status.words;
		const row = el(panel, "div", `tc-source-row is-${status.tone}`);
		row.appendChild(icon(status.source));
		const lines = el(row, "div", "tc-source-lines");
		el(lines, "span", "tc-source-name", text.name);
		el(lines, "span", "tc-source-sub", text.sub);
		labelMark(el(row, "span", "tc-source-time", text.time), text.alert, text.time);
	}

	close(): void {
		void this.overlay.close();
	}
}
