import { type DropColumn, type StackedList, stackedLists, type ViewLayout } from "../../../core/application/contracts";
import { DESIGN, DURATION, PROPERTY, tokenMs } from "../design";
import { el, px } from "../dom";
import { Motion, restingRect } from "../motion/Motion";
import type { ListColumn } from "../drag/DropTarget";
import type { TaskList } from "../TaskList";
import { type FunnelList, funnelList } from "./FunnelLists";
import type { LayoutHost } from "./LayoutHost";
import type { LayoutDrop, LayoutHold, LayoutMotion } from "./ModeLayout";
import { StillLayout } from "./StillLayout";

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
	private readonly holds = new Set<LayoutHold>();
	private readonly sized: ResizeObserver;
	/** The next heights come in sliding (the same context changed) or at once (another context, the first drawing). */
	private still = true;
	private frameId = 0;
	private destroyed = false;

	constructor(host: LayoutHost, layout: ViewLayout) {
		super(host, layout, "is-rows");
		const body = this.columns.find((col) => col.column.id === "rows")?.body ?? this.stage;
		this.stack = el(body, "div", "tc-rows-stack");
		this.stack.classList.toggle("is-growing", !this.scrolls);
		this.fadeProbe = el(this.stack, "div", "tc-rows-fade-probe");
		const titles = new Map(layout.columns.flatMap((column) => column.lists).map((list) => [list.list, list.title]));
		this.rows = (layout.stack?.lists ?? []).map((column) => {
			const row = el(this.stack, "div", "tc-row");
			row.dataset.column = column;
			const label = el(row, "div", "tc-row-label");
			const area = el(row, "div", "tc-row-body");
			const funnel = funnelList(host.lists, column, { area });
			funnel.list.el.classList.add("tc-row-list");
			funnel.drop.onHover = (over) => funnel.list.el.classList.toggle("is-drop-room", over);
			return { column, el: row, label, title: titles.get(column) ?? null, funnel };
		});
		const view = host.root.ownerDocument.defaultView ?? window;
		this.sized = new view.ResizeObserver(() => this.fit());
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
	private fit(): void {
		if (this.destroyed || !this.scrolls || this.holds.has("carry")) return;
		const view = this.host.root.ownerDocument.defaultView ?? window;
		if (this.frameId) return;
		this.frameId = view.requestAnimationFrame(() => {
			this.frameId = 0;
			this.apply(this.still);
		});
	}

	/** `still`: another context drawn, its heights stand at once, even while a carry holds the rows (a held card opened another node). */
	private apply(still = false): void {
		if (this.destroyed || !this.scrolls || (!still && this.holds.has("carry")) || this.stack.clientHeight === 0) return;
		const measured = this.rows.map((row) => this.measure(row));
		const style = getComputedStyle(this.stack);
		const gap = this.rows.length > 1 ? parseFloat(getComputedStyle(this.rows[1].el).marginTop) || 0 : 0;
		const room = this.stack.clientHeight - (parseFloat(style.paddingBottom) || 0) - gap * (this.rows.length - 1);
		/** A task typed where every list has to share: the list keeps its height and scrolls the field into view, none of the others moves. */
		if (this.holds.has("typing") && measured.reduce((sum, list) => sum + list.wanted, 0) > room) return;
		const heights = stackedLists(measured, room, this.fadeProbe.offsetHeight);
		this.still = false;
		const now = this.rows.map((row) => row.el.getBoundingClientRect().height);
		this.stack.classList.toggle("is-still", still);
		/**
		 * Every row takes its new height in one motion, with the cards that grow in, slide or fold away: a row under rows that
		 * change moves once, and a card landing in it is read where it comes to rest (`Motion.settles`).
		 */
		const ms = still ? 0 : tokenMs(this.stack, DURATION.collapse);
		let dy = 0;
		this.rows.forEach((row, i) => {
			Motion.settles(row.el, dy, ms);
			dy += heights[i] - now[i];
			row.el.style.height = px(heights[i]);
		});
		if (still) {
			void this.stack.offsetHeight;
			this.stack.classList.remove("is-still");
		}
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
		const content = ends.length > 0 ? ends[ends.length - 1].end : parseFloat(style.paddingTop) || 0;
		/** The room at the list's end while a task is typed in it: the desktop's bar stands there, under the field. */
		const after = getComputedStyle(list, "::after");
		const room = after.content !== "none" && after.content !== "normal" ? (parseFloat(after.height) || 0) + gap : 0;
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
		this.sized.disconnect();
		const view = this.host.root.ownerDocument.defaultView ?? window;
		if (this.frameId) view.cancelAnimationFrame(this.frameId);
		for (const row of this.rows) row.funnel.list.destroy();
		this.host.root.style.removeProperty(PROPERTY.fadeLeft);
		super.destroy();
	}
}
