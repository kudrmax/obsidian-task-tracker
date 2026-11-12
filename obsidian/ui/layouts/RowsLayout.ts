import { type DropColumn, type StackedList, stackedLists, type ViewLayout } from "../../../core/application/contracts";
import { el, px } from "../dom";
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
	private waiting: object | null = null;
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
			funnel.drop.hovered = (over) => funnel.list.el.classList.toggle("is-drop-room", over);
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
		if (motion === "replace") this.still = true;
		this.frame();
		this.fit();
	}

	/** Measures again once nothing moves in the lists and nothing holds them, then sets each row's height. */
	private fit(): void {
		if (this.destroyed || !this.scrolls || this.holds.size > 0) return;
		const view = this.host.root.ownerDocument.defaultView ?? window;
		const moving = this.stack.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running" && !this.isRowHeight(animation));
		const token = {};
		this.waiting = token;
		if (moving.length > 0) {
			void Promise.allSettled(moving.map((animation) => animation.finished)).then(() => {
				if (this.waiting === token) this.fit();
			});
			return;
		}
		if (this.frameId) view.cancelAnimationFrame(this.frameId);
		this.frameId = view.requestAnimationFrame(() => {
			this.frameId = 0;
			if (this.waiting === token) this.apply();
		});
	}

	/** A row's own height sliding to its last measure: not motion in the lists. */
	private isRowHeight(animation: Animation): boolean {
		const target = (animation.effect as KeyframeEffect | null)?.target;
		return target instanceof HTMLElement && target.classList.contains("tc-row");
	}

	private apply(): void {
		if (this.destroyed || this.holds.size > 0 || this.stack.clientHeight === 0) return;
		const measured = this.rows.map((row) => this.measure(row));
		const style = getComputedStyle(this.stack);
		const gap = this.rows.length > 1 ? parseFloat(getComputedStyle(this.rows[1].el).marginTop) || 0 : 0;
		const room = this.stack.clientHeight - (parseFloat(style.paddingBottom) || 0) - gap * (this.rows.length - 1);
		const heights = stackedLists(measured, room, this.fadeProbe.offsetHeight);
		const still = this.still;
		this.still = false;
		this.stack.classList.toggle("is-still", still);
		this.rows.forEach((row, i) => (row.el.style.height = px(heights[i])));
		if (still) {
			void this.stack.offsetHeight;
			this.stack.classList.remove("is-still");
		}
	}

	/** A row as it stands drawn: its whole height (label, cards, plate), and where each card ends, from the row's top. */
	private measure(row: Row): StackedList {
		const list = row.funnel.list.el;
		const label = row.label.offsetHeight;
		const style = getComputedStyle(list);
		const inFlow = [...list.children].filter((child): child is HTMLElement => child instanceof HTMLElement && !child.classList.contains("is-leaving") && getComputedStyle(child).position !== "absolute");
		const stops = inFlow.filter((child) => !child.classList.contains("tc-group-head")).map((child) => label + child.offsetTop + child.offsetHeight);
		const last = inFlow[inFlow.length - 1];
		const content = last ? last.offsetTop + last.offsetHeight : parseFloat(style.paddingTop) || 0;
		return { wanted: label + content + (parseFloat(style.paddingBottom) || 0), stops };
	}

	override frame(): void {
		super.frame();
		this.fit();
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
		const was = this.holds.size > 0;
		if (on) this.holds.add(reason);
		else this.holds.delete(reason);
		if (was && this.holds.size === 0) this.fit();
	}

	override destroy(): void {
		this.destroyed = true;
		this.sized.disconnect();
		const view = this.host.root.ownerDocument.defaultView ?? window;
		if (this.frameId) view.cancelAnimationFrame(this.frameId);
		for (const row of this.rows) row.funnel.list.destroy();
		super.destroy();
	}
}
