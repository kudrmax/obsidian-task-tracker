import type { SourceStatus } from "../../application/contracts";
import { PROPERTY } from "../design";
import { el, px } from "../dom";
import { Overlay } from "../menu/Overlay";
import { sourceIcon } from "./sourceIcons";
import { sourceText } from "./sourceText";

export interface SourcesPopoverOptions {
	/** The switch at the bottom; a copy of it stays over the backdrop, and the panel stands over it, centred on it. */
	readonly anchor: HTMLElement;
	readonly statuses: readonly SourceStatus[];
	readonly now: Date;
	onRefresh(): Promise<void>;
}

/** The sources window: each calendar with when it was last brought up to date, and Refresh now. */
export class SourcesPopover {
	private readonly overlay: Overlay;

	static open(opts: SourcesPopoverOptions): SourcesPopover {
		return new SourcesPopover(opts);
	}

	private constructor(opts: SourcesPopoverOptions) {
		this.overlay = new Overlay(() => this.close());
		const rect = opts.anchor.getBoundingClientRect();
		const copy = this.overlay.add(opts.anchor.cloneNode(true) as HTMLElement);
		copy.classList.add("tc-seg-copy");
		copy.style.left = px(rect.left);
		copy.style.top = px(rect.top);
		const panel = this.overlay.add(el(null, "div", "tc-popover"));
		panel.style.left = px(rect.left + rect.width / 2);
		panel.style.setProperty(PROPERTY.panelY, px(window.innerHeight - rect.top));
		for (const status of opts.statuses) {
			const text = sourceText(status, opts.now);
			const row = el(panel, "div", "tc-source-row");
			row.appendChild(sourceIcon(status.source));
			const lines = el(row, "div", "tc-source-lines");
			el(lines, "span", "tc-source-name", text.name);
			el(lines, "span", "tc-source-sub", text.sub);
			const time = el(row, "span", "tc-source-time", text.time);
			time.classList.toggle("is-stale", text.stale);
		}
		const refresh = el(panel, "button", "tc-source-refresh");
		refresh.appendChild(sourceIcon("refresh"));
		refresh.appendChild(document.createTextNode("Refresh now"));
		refresh.addEventListener("click", () => {
			this.close();
			void opts.onRefresh();
		});
		this.overlay.show();
	}

	close(): void {
		this.overlay.close();
	}
}
