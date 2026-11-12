import type { ViewLayout } from "../../../core/application/contracts";
import { el } from "../dom";
import type { ListColumn } from "../drag/DropTarget";
import type { TaskList } from "../TaskList";
import { type FunnelList, funnelList } from "./FunnelLists";
import type { LayoutHost } from "./LayoutHost";
import type { LayoutDrop, LayoutMotion } from "./ModeLayout";
import { StillLayout } from "./StillLayout";

/**
 * All columns (`allColumns`, the desktop only, board D1): Inbox over Backlog, Soon and the day's list, each as wide as the
 * divider sets (`layoutWidths`), and the timeline the rest; every list and the timeline in sight at once, nothing slides.
 */
export class ColumnsLayout extends StillLayout {
	private readonly lists: readonly FunnelList[];
	private readonly titles = new Map<"inbox" | "soon" | "backlog", HTMLElement>();
	private readonly dayBody: HTMLElement | null;

	constructor(host: LayoutHost, layout: ViewLayout) {
		super(host, layout, "is-columns");
		const lists: FunnelList[] = [];
		for (const col of this.columns) {
			const id = col.column.id;
			if (id === "inbox") {
				this.titles.set("inbox", el(col.head, "div", "tc-head-title"));
				const inboxPane = el(col.body, "div", "tc-pane is-inbox");
				const backlogPane = el(col.body, "div", "tc-pane is-backlog");
				lists.push(funnelList(host.lists, "inbox", { area: inboxPane, title: { el: () => this.titles.get("inbox") ?? null, over: true } }));
				const backlogTitle = el(el(backlogPane, "div", "tc-pane-head"), "div", "tc-head-title");
				this.titles.set("backlog", backlogTitle);
				lists.push(funnelList(host.lists, "backlog", { area: backlogPane, title: { el: () => backlogTitle, over: false } }));
			} else if (id === "soon") {
				this.titles.set("soon", el(col.head, "div", "tc-head-title"));
				lists.push(funnelList(host.lists, "soon", { area: col.body, title: { el: () => this.titles.get("soon") ?? null, over: true } }));
			} else if (id === "day") {
				lists.push(funnelList(host.lists, "day", { area: col.body, title: { el: () => host.shared.dayTitle, over: true } }));
			}
		}
		this.lists = lists;
		this.dayBody = this.columns.find((col) => col.column.id === "day")?.body ?? null;
	}

	render(motion: LayoutMotion): void {
		for (const { list } of this.lists) list.render(motion === "move");
		this.frame();
	}

	override frame(): void {
		super.frame();
		for (const [column, title] of this.titles) title.textContent = this.host.listName(column);
	}

	drops(): readonly LayoutDrop[] {
		return this.lists.map((list) => list.drop);
	}

	override listOf(column: ListColumn): TaskList | null {
		return this.lists.find((list) => list.column === column)?.list ?? null;
	}

	override titleOf(column: "day" | "inbox" | "soon" | "backlog"): HTMLElement | null {
		return column === "day" ? super.titleOf(column) : (this.titles.get(column) ?? null);
	}

	override dayLane(): HTMLElement | null {
		return this.dayBody;
	}

	override destroy(): void {
		for (const { list } of this.lists) list.destroy();
		super.destroy();
	}
}
