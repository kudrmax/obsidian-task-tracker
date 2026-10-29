import type { SourceStatus } from "../../application/contracts";
import { DURATION, PROPERTY, tokenMs } from "../design";
import { el, px } from "../dom";
import { Backdrop } from "../menu/Backdrop";
import { sourceIcon } from "./sourceIcons";
import { sourceText } from "./sourceText";

export interface SourcesPopoverOptions {
	/** The switch in the day row; a copy of it stays over the backdrop, and the panel hangs under it. */
	readonly anchor: HTMLElement;
	readonly statuses: readonly SourceStatus[];
	readonly now: Date;
	onRefresh(): Promise<void>;
}

/** The sources window: each calendar with when it was last brought up to date, and Refresh now. */
export class SourcesPopover {
	private readonly backdrop: Backdrop;
	private readonly copy: HTMLElement;
	private readonly panel: HTMLElement;
	private closed = false;

	static open(opts: SourcesPopoverOptions): SourcesPopover {
		return new SourcesPopover(opts);
	}

	private constructor(opts: SourcesPopoverOptions) {
		this.backdrop = new Backdrop(() => this.close());
		const rect = opts.anchor.getBoundingClientRect();
		this.copy = opts.anchor.cloneNode(true) as HTMLElement;
		this.copy.classList.add("tc-seg-copy");
		this.copy.style.left = px(rect.left);
		this.copy.style.top = px(rect.top);
		document.body.appendChild(this.copy);
		this.panel = el(document.body, "div", "tc-popover");
		this.panel.style.setProperty(PROPERTY.panelY, px(rect.bottom));
		for (const status of opts.statuses) {
			const text = sourceText(status, opts.now);
			const row = el(this.panel, "div", "tc-source-row");
			row.appendChild(sourceIcon(status.source));
			const lines = el(row, "div", "tc-source-lines");
			el(lines, "span", "tc-source-name", text.name);
			el(lines, "span", "tc-source-sub", text.sub);
			const time = el(row, "span", "tc-source-time", text.time);
			time.classList.toggle("is-stale", text.stale);
		}
		const refresh = el(this.panel, "button", "tc-source-refresh");
		refresh.appendChild(sourceIcon("refresh"));
		refresh.appendChild(document.createTextNode("Refresh now"));
		refresh.addEventListener("click", () => {
			this.close();
			void opts.onRefresh();
		});
		requestAnimationFrame(() => this.panel.classList.add("is-shown"));
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.backdrop.el.classList.remove("is-shown");
		this.panel.classList.remove("is-shown");
		window.setTimeout(() => {
			this.backdrop.remove();
			this.copy.remove();
			this.panel.remove();
		}, tokenMs(this.panel, DURATION.collapse));
	}
}
