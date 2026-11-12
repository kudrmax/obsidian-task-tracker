import { type LayoutColumn, layoutShareAt, layoutWidths, type ViewLayout, type ViewMode } from "../../../core/application/contracts";
import { DESIGN } from "../design";
import { Divider } from "../Divider";
import { el, px } from "../dom";
import type { ListColumn } from "../drag/DropTarget";
import type { ProjectTasks } from "../projects/ProjectTasks";
import type { TaskList } from "../TaskList";
import type { LayoutHost } from "./LayoutHost";
import type { LayoutDrop, LayoutHold, LayoutMotion, ModeLayout } from "./ModeLayout";

/** A column of a still layout as built: its element, its title row (where the layout has titles) and its body. */
export interface StageColumn {
	readonly column: LayoutColumn;
	readonly el: HTMLElement;
	readonly head: HTMLElement | null;
	readonly body: HTMLElement;
}

/**
 * A layout that stands still (`swipe: "none"`): its columns side by side in one row of its own (`.tc-stage`), as the core
 * lays them out (`ViewChoice.layout`), each as wide as `layoutWidths` says, the divider before the timeline. Nothing
 * slides: no swipe, no wheel, no place. The day's title stands over the day's list, or over the timeline where no day
 * list stands; the timeline is the screen's, taken into its column while the layout stands and given back after.
 */
export abstract class StillLayout implements ModeLayout {
	readonly track = null;
	protected readonly stage: HTMLElement;
	protected readonly columns: readonly StageColumn[];
	private readonly widthsOf: (share: number) => ReturnType<typeof layoutWidths>;

	constructor(
		protected readonly host: LayoutHost,
		readonly layout: ViewLayout,
		kind: string,
	) {
		const root = host.root;
		const shared = host.shared;
		shared.place(null, null);
		this.stage = el(null, "div", `tc-stage ${kind}`);
		root.insertBefore(this.stage, root.querySelector(":scope > .tc-fade"));
		const titled = layout.columns.some((column) => column.id === "inbox" || column.id === "soon" || column.id === "day");
		const built: StageColumn[] = [];
		layout.columns.forEach((column, i) => {
			if (i > 0) this.between(column);
			const col = el(this.stage, "div", `tc-stage-col is-${column.id}${column.width === "rest" ? " is-rest" : ""}`);
			const head = titled ? el(col, "div", "tc-stage-head") : null;
			const body = el(col, "div", "tc-stage-body");
			built.push({ column, el: col, head, body });
		});
		this.columns = built;
		const nav = built.find((col) => col.column.id === "day") ?? built.find((col) => col.column.id === "timeline");
		const timeline = built.find((col) => col.column.id === "timeline");
		const navHead = nav ? (nav.head ?? el(null, "div", "tc-stage-head")) : null;
		if (nav && navHead && !nav.head) nav.el.insertBefore(navHead, nav.body);
		shared.place(navHead, timeline?.body ?? null);
		this.widthsOf = (share) => layoutWidths(layout, share, host.stageWidth(), DESIGN.dividerWidth);
	}

	/** What stands between two columns: the divider before the timeline (it sets the lists' width), a line between lists. */
	private between(next: LayoutColumn): void {
		const host = this.host;
		if (next.id === "timeline" && this.layout.divider) {
			const shareAt = (at: number) => layoutShareAt(this.layout, at, host.stageWidth(), DESIGN.dividerWidth) ?? host.share();
			const bounds = () => this.widthsOf(host.share())?.divider;
			new Divider(el(this.stage, "div", "tc-stage-divider"), {
				width: () => bounds()?.width ?? 0,
				onWidth: (at) => this.applyWidths(shareAt(at)),
				onRelease: (at) => host.saveShare(shareAt(at)),
				min: () => bounds()?.min ?? 0,
				max: () => bounds()?.max ?? 0,
				center: () => bounds()?.center ?? 0,
				onSnap: () => host.tap(),
				arbiter: host.arbiter,
			});
			return;
		}
		el(el(this.stage, "div", "tc-stage-rule"), "div", "tc-divider-line");
	}

	get mode(): ViewMode {
		return this.layout.mode;
	}

	abstract render(motion: LayoutMotion): void;

	frame(): void {
		this.applyWidths(this.host.share());
	}

	/** Each column as wide as the core says at `share`; the last, the rest. A view not laid out yet keeps the CSS's widths. */
	private applyWidths(share: number): void {
		if (this.host.stageWidth() <= 0) return;
		const widths = this.widthsOf(share);
		if (!widths) return;
		this.columns.forEach((col, i) => {
			if (col.column.width === "rest") col.el.style.removeProperty("width");
			else col.el.style.width = px(widths.widths[i] ?? 0);
		});
	}

	showPlace(): void {}

	abstract drops(): readonly LayoutDrop[];

	timelineShows(): boolean {
		return this.columns.some((col) => col.column.id === "timeline");
	}

	listOf(_column: ListColumn): TaskList | null {
		return null;
	}

	projects(): ProjectTasks | null {
		return null;
	}

	titleOf(column: "day" | "inbox" | "soon" | "backlog"): HTMLElement | null {
		return column === "day" && this.columns.some((col) => col.column.id === "day") ? this.host.shared.dayTitle : null;
	}

	dayLane(): HTMLElement | null {
		return null;
	}

	scroller(): HTMLElement | null {
		return null;
	}

	hold(_reason: LayoutHold, _on: boolean): void {}

	hide(missing: boolean): void {
		this.stage.classList.toggle("tc-hidden", missing);
	}

	destroy(): void {
		this.host.shared.place(null, null);
		this.stage.remove();
	}
}
