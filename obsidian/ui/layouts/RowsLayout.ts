import { type DropColumn, type StackedList, stackedLists, type ViewLayout } from "../../../core/application/contracts";
import { DESIGN, DURATION, PROPERTY, tokenMs } from "../design";
import { el, px } from "../dom";
import { Motion, restingMarginBottom, restingRect } from "../motion/Motion";
import type { ListColumn } from "../drag/DropTarget";
import type { TaskList } from "../TaskList";
import { type FunnelList, funnelList } from "./FunnelLists";
import type { LayoutHost } from "./LayoutHost";
import type { LayoutDrop, LayoutHold, LayoutMotion } from "./ModeLayout";
import { StillLayout } from "./StillLayout";

/** How long after the rows' motion ends they are measured again (a card leaves in twice the collapse: fade, then fold). */
const SETTLE_MARGIN_MS = 32;

/** A stage of the rows: its label over its list. */
interface Row {
	readonly column: DropColumn;
	readonly el: HTMLElement;
	readonly label: HTMLElement;
	readonly title: string | null;
	readonly funnel: FunnelList;
}

/**
 * The rows (`rows`, boards D2, T3): the funnel's lists stacked in the core's order (`layout.stack`), each under its small
 * label, the timeline beside them behind the divider. Each list is as tall as its cards while all fit; when they don't,
 * the core's `stackedLists` shares the room, a list that scrolls ending under a whole card and the fade. The heights are
 * measured from what the lists draw once their motion has settled, and kept as they stand while a card or the plus is
 * carried or a task typed; only the list under a carried card opens room at its end. In a note's block (`scrolls` false)
 * every list is as tall as its cards and the stack scrolls as one.
 */
export class RowsLayout extends StillLayout {
	private readonly stack: HTMLElement;
	private readonly rows: readonly Row[];
	/** A box as tall as a list's scroll fade (`--tc-scroll-fade`), read for `stackedLists`. */
	private readonly fadeProbe: HTMLElement;
	/** A box as tall as the room a list keeps under a field typed in it (`--tc-row-entry-room`). */
	private readonly entryProbe: HTMLElement;
	private readonly holds = new Set<LayoutHold>();
	private readonly sized: ResizeObserver;
	/** The next heights come in sliding (the same context changed) or at once (another context, the first drawing). */
	private still = true;
	private frameId = 0;
	/** The next fit stands at once: the room itself changed. */
	private fitStill = false;
	/** Once every card has grown in, slid and folded away, the rows are measured again as they stand: what the motion's start could not know is set right. */
	private settleTimer = 0;
	private destroyed = false;

	constructor(host: LayoutHost, layout: ViewLayout) {
		super(host, layout, "is-rows");
		const body = this.columns.find((col) => col.column.id === "rows")?.body ?? this.stage;
		this.stack = el(body, "div", "tc-rows-stack");
		this.stack.classList.toggle("is-growing", !this.scrolls);
		this.fadeProbe = el(this.stack, "div", "tc-rows-fade-probe");
		this.entryProbe = el(this.stack, "div", "tc-rows-entry-probe");
		const titles = new Map(layout.columns.flatMap((column) => column.lists).map((list) => [list.list, list.title]));
		this.rows = (layout.stack?.lists ?? []).map((column) => {
			const row = el(this.stack, "div", "tc-row");
			row.dataset.column = column;
			const label = el(row, "div", "tc-row-label");
			const area = el(row, "div", "tc-row-body");
			const funnel = funnelList(host.lists, column, { area });
			funnel.list.el.classList.add("tc-row-list");
			funnel.drop.onHover = (over) => {
				funnel.list.el.classList.toggle("is-drop-room", over);
				if (!over) this.fit();
			};
			return { column, el: row, label, title: titles.get(column) ?? null, funnel };
		});
		const view = host.root.ownerDocument.defaultView ?? window;
		/** The room changed (the window, the panel): the rows follow it at once, no slide behind the window's edge. */
		this.sized = new view.ResizeObserver(() => this.fit(true));
		this.sized.observe(this.stack);
	}

	private get scrolls(): boolean {
		return this.layout.stack?.scrolls ?? false;
	}

	render(motion: LayoutMotion): void {
		for (const row of this.rows) {
			row.label.textContent = row.title ?? this.host.dayName();
			row.funnel.list.render(motion === "move");
		}
		super.frame();
		/** Measured now, at the shape the lists move to: the rows start their slide in the same frame as the cards. */
		this.apply(motion === "replace" || this.still);
	}

	/**
	 * Measures again and sets each row's height on the next frame, its slide running with the cards that grow in, slide
	 * or fold away: the rows are measured at the shape the lists move to, not as they stand mid-motion.
	 */
	private fit(still = false): void {
		if (this.destroyed || !this.scrolls || this.holds.has("carry")) return;
		const view = this.host.root.ownerDocument.defaultView ?? window;
		this.fitStill ||= still;
		if (this.frameId) return;
		this.frameId = view.requestAnimationFrame(() => {
			this.frameId = 0;
			const asked = this.fitStill;
			this.fitStill = false;
			this.apply(this.still || asked);
		});
	}

	/** `still`: another context drawn, its heights stand at once, even while a carry holds the rows (a held card opened another node). */
	private apply(still = false): void {
		if (this.destroyed || !this.scrolls || (!still && this.holds.has("carry")) || this.stack.clientHeight === 0) return;
		const measured = this.rows.map((row) => this.measure(row));
		const style = getComputedStyle(this.stack);
		const gap = this.rows.length > 1 ? parseFloat(getComputedStyle(this.rows[1].el).marginTop) || 0 : 0;
		const room = this.stack.clientHeight - (parseFloat(style.paddingBottom) || 0) - gap * (this.rows.length - 1);
		const now = this.rows.map((row) => row.el.getBoundingClientRect().height);
		/**
		 * A task typed where every list has to share: the lists keep their heights and the field's list scrolls it into view,
		 * only made tall enough, once, for the field and the bar's room under it, from the tallest of the others.
		 */
		const typed = this.holds.has("typing") && measured.reduce((sum, list) => sum + list.wanted, 0) > room;
		const heights = typed ? this.typingHeights(now) : stackedLists(measured, room, this.fadeProbe.offsetHeight);
		if (!heights) return;
		this.still = false;
		this.stack.classList.toggle("is-still", still);
		/**
		 * Every row takes its new height in one motion, with the cards that grow in, slide or fold away: a row under rows that
		 * change moves once, and a card landing in it is read where it comes to rest (`Motion.settles`).
		 */
		const ms = still ? 0 : tokenMs(this.stack, DURATION.collapse);
		/**
		 * A card that fades before it folds away (`Motion.leave`) keeps its room while it fades: every row then waits as long,
		 * and they all take their heights together as it folds, none ahead of another.
		 */
		const fading = !still && this.rows.some((row) => [...row.funnel.list.el.children].some((child) => child.classList.contains("is-leaving") && !child.classList.contains("is-lifted")));
		const delay = fading ? ms : 0;
		let dy = 0;
		this.rows.forEach((row, i) => {
			Motion.settles(row.el, dy, delay + ms);
			dy += heights[i] - now[i];
			row.el.style.transitionDelay = delay > 0 ? `${delay}ms` : "";
			row.el.style.height = px(heights[i]);
		});
		const view = this.host.root.ownerDocument.defaultView ?? window;
		view.clearTimeout(this.settleTimer);
		const changed = heights.some((height, i) => Math.abs(height - now[i]) > 0.5);
		if (!still && changed) this.settleTimer = view.setTimeout(() => this.fit(), delay + 2 * ms + SETTLE_MARGIN_MS);
		if (still) {
			void this.stack.offsetHeight;
			this.stack.classList.remove("is-still");
		}
	}

	/** The heights while a task is typed in rows that share the room: as they stand, the field's row made tall enough for it; null when it already is. */
	private typingHeights(now: readonly number[]): number[] | null {
		const at = this.rows.findIndex((row) => row.funnel.list.el.querySelector(":scope > .tc-quick-row") !== null);
		if (at < 0) return null;
		const row = this.rows[at];
		const field = row.funnel.list.el.querySelector<HTMLElement>(":scope > .tc-quick-row")!;
		const style = getComputedStyle(row.funnel.list.el);
		const need = row.label.offsetHeight + (parseFloat(style.paddingTop) || 0) + restingRect(field).height + this.entryProbe.offsetHeight;
		const deficit = need - now[at];
		if (deficit <= 0.5) return null;
		const heights = [...now];
		const giver = heights.reduce((best, height, i) => (i !== at && (best < 0 || height > heights[best]) ? i : best), -1);
		if (giver < 0) return null;
		heights[giver] -= deficit;
		heights[at] = need;
		return heights;
	}

	/**
	 * A row as it will stand once its cards have grown in and slid to their places (`restingRect`): its whole height
	 * (label, cards, plate), and where each card ends, from the row's top.
	 */
	private measure(row: Row): StackedList {
		const list = row.funnel.list.el;
		const label = row.label.offsetHeight;
		const style = getComputedStyle(list);
		const top = restingRect(list).top - list.scrollTop;
		const gap = parseFloat(style.rowGap) || 0;
		const inFlow = [...list.children].filter((child): child is HTMLElement => child instanceof HTMLElement && getComputedStyle(child).position !== "absolute");
		let growth = 0;
		const ends: { readonly child: HTMLElement; readonly end: number }[] = [];
		for (const child of inFlow) {
			const now = child.getBoundingClientRect().height;
			if (child.classList.contains("is-leaving")) {
				const margins = getComputedStyle(child);
				growth -= now + (parseFloat(margins.marginTop) || 0) + (parseFloat(margins.marginBottom) || 0) + gap;
				continue;
			}
			const resting = restingRect(child);
			ends.push({ child, end: resting.top + growth + resting.height - top });
			growth += resting.height - now;
		}
		const stops = ends.filter(({ child }) => !child.classList.contains("tc-group-head")).map(({ end }) => label + end);
		const last = ends[ends.length - 1];
		const content = last ? last.end + restingMarginBottom(last.child) : parseFloat(style.paddingTop) || 0;
		/** The room at the list's end while a task is typed in it: the desktop's bar stands there, under the field. */
		const after = getComputedStyle(list, "::after");
		/** The drop room under a carried card is the list's for the carry only: never measured into its height. */
		const room = after.content !== "none" && after.content !== "normal" && !list.classList.contains("is-drop-room") ? (parseFloat(after.height) || 0) + gap : 0;
		return { wanted: label + content + room + (parseFloat(style.paddingBottom) || 0), stops };
	}

	override frame(): void {
		super.frame();
		this.fit();
	}

	/** The screen's foot fade lies past the rows' column, over the timeline: a list in the rows ends on its own. */
	protected override widthsApplied(widths: readonly number[]): void {
		if (!this.scrolls) return;
		const docked = this.host.root.clientWidth - this.host.stageWidth();
		this.host.root.style.setProperty(PROPERTY.fadeLeft, px(docked + (widths[0] ?? 0) + DESIGN.dividerWidth));
	}

	drops(): readonly LayoutDrop[] {
		return this.rows.map((row) => row.funnel.drop);
	}

	override listOf(column: ListColumn): TaskList | null {
		return this.rows.find((row) => row.column === column)?.funnel.list ?? null;
	}

	override scroller(): HTMLElement | null {
		return this.scrolls ? null : this.stack;
	}

	override hold(reason: LayoutHold, on: boolean): void {
		const was = this.holds.has(reason);
		if (on) this.holds.add(reason);
		else this.holds.delete(reason);
		if (was !== on) this.fit();
	}

	override destroy(): void {
		this.destroyed = true;
		(this.host.root.ownerDocument.defaultView ?? window).clearTimeout(this.settleTimer);
		this.sized.disconnect();
		const view = this.host.root.ownerDocument.defaultView ?? window;
		if (this.frameId) view.cancelAnimationFrame(this.frameId);
		for (const row of this.rows) row.funnel.list.destroy();
		this.host.root.style.removeProperty(PROPERTY.fadeLeft);
		super.destroy();
	}
}
