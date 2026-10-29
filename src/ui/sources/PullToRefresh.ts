import type { SourceStatus } from "../../application/contracts";
import { DURATION, LAYOUT, PROPERTY, tokenMs, tokenPx } from "../design";
import { capturePointer, clear, el, px, releasePointer } from "../dom";
import type { GestureArbiter } from "../gestures";
import { sourceIcon } from "./sourceIcons";
import { sourceText } from "./sourceText";

export interface PullToRefreshOptions {
	/** The element that holds the area which the pull opens; it sits over the timeline's top. */
	readonly column: HTMLElement;
	readonly arbiter: GestureArbiter;
	statuses(): readonly SourceStatus[];
	now(): Date;
	onRefresh(): Promise<void>;
}

const PULL = "pull";
/** How much of the finger's travel the timeline follows. */
const PULL_FOLLOW = 0.6;

/** Pulling the timeline down from its top opens the sources' lines; letting go past the threshold refreshes them. */
export class PullToRefresh {
	readonly area: HTMLElement;
	private press: { readonly pointerId: number; readonly y: number } | null = null;
	private offset = 0;
	private refreshing = false;

	constructor(
		private readonly timeline: HTMLElement,
		private readonly opts: PullToRefreshOptions,
	) {
		this.area = el(opts.column, "div", "tc-pull");
		timeline.addEventListener("pointerdown", (e) => this.down(e));
		timeline.addEventListener("pointermove", (e) => this.move(e));
		timeline.addEventListener("pointerup", (e) => void this.up(e));
		timeline.addEventListener("pointercancel", (e) => void this.up(e));
	}

	renderArea(): void {
		clear(this.area);
		const spinner = el(this.area, "div", "tc-pull-spinner");
		spinner.appendChild(sourceIcon("spinner"));
		for (const status of this.opts.statuses()) {
			const text = sourceText(status, this.opts.now());
			const row = el(this.area, "div", "tc-pull-row");
			row.appendChild(sourceIcon(status.source));
			el(row, "span", "tc-pull-name", text.short);
			const time = el(row, "span", "tc-pull-time", text.time);
			time.classList.toggle("is-stale", text.stale);
		}
	}

	private down(e: PointerEvent): void {
		if (e.pointerType === "mouse" || !e.isPrimary || this.refreshing || this.timeline.scrollTop > 0 || this.opts.arbiter.busy) return;
		this.press = { pointerId: e.pointerId, y: e.clientY };
	}

	private move(e: PointerEvent): void {
		if (!this.press || e.pointerId !== this.press.pointerId) return;
		const travel = e.clientY - this.press.y;
		if (this.offset === 0) {
			if (travel <= LAYOUT.pressTolerance || this.timeline.scrollTop > 0) return;
			if (!this.opts.arbiter.claim(PULL)) return;
			capturePointer(this.timeline, e.pointerId);
			this.renderArea();
			this.area.classList.add("is-open");
			this.timeline.classList.add("is-pulling");
		}
		this.setOffset(Math.min(tokenPx(this.area, "--tc-pull-shift"), travel * PULL_FOLLOW));
	}

	setOffset(offset: number): void {
		this.offset = offset;
		this.timeline.style.setProperty(PROPERTY.pull, px(offset));
		this.area.style.setProperty(PROPERTY.pull, px(offset));
	}

	private async up(e: PointerEvent): Promise<void> {
		if (!this.press || e.pointerId !== this.press.pointerId) return;
		this.press = null;
		if (this.offset === 0) return;
		releasePointer(this.timeline, e.pointerId);
		this.timeline.classList.remove("is-pulling");
		const refresh = this.offset >= LAYOUT.pullThreshold;
		if (refresh) {
			this.refreshing = true;
			this.area.classList.add("is-refreshing");
			this.setOffset(tokenPx(this.area, "--tc-pull-shift"));
			await this.opts.onRefresh();
			this.refreshing = false;
			this.area.classList.remove("is-refreshing");
		}
		this.setOffset(0);
		this.opts.arbiter.release(PULL);
		window.setTimeout(() => this.area.classList.remove("is-open"), tokenMs(this.area, DURATION.pull));
	}
}
