import { LIST_WIDTHS, type ViewLayout } from "../../../core/application/contracts";
import { ColumnHeaders } from "../ColumnHeaders";
import { DURATION, PROPERTY, tokenMs } from "../design";
import { Divider } from "../Divider";
import { el, px } from "../dom";
import type { ListColumn } from "../drag/DropTarget";
import { centeredListWidth, listShareOf, listWidthMax, shownListWidth } from "../listWidth";
import type { ScreenTrack } from "../ScreenPager";
import type { Place, Shift } from "../screens";
import { EdgeTrack, edgeParts, StripTrack } from "../ScreenTracks";
import { TaskList } from "../TaskList";
import { type FunnelList, funnelList } from "./FunnelLists";
import type { LayoutHost } from "./LayoutHost";
import type { LayoutDrop, LayoutMotion, ModeLayout } from "./ModeLayout";

/** The classes of the ribbon's places on the screen: its own, gone with it. */
const PLACES = ["is-lists", "is-inbox", "is-done", "is-switching"] as const;

/**
 * Two columns (`twoColumns`, `swipe: "pages"`): a window two columns wide on a strip of four, Inbox over Backlog, Soon,
 * the day's list and the timeline, Done left of Inbox for the search alone. The wheel and a swipe slide the strip from
 * place to place; at Inbox and Soon the two columns split the screen in half, at Today the divider sets the day list
 * against the calendar (`docs/plugin/screen.md`, the app's `RibbonColumns`). Its parts and its place classes are its own:
 * mounted only in this mode, gone with it.
 */
export class RibbonLayout implements ModeLayout {
	readonly mode = "twoColumns" as const;
	readonly track: (shift: Shift) => ScreenTrack;
	private readonly parts: HTMLElement[] = [];
	private readonly heads: ColumnHeaders;
	private readonly day: FunnelList;
	private readonly inbox: FunnelList;
	private readonly backlog: FunnelList;
	private readonly soon: FunnelList;
	private readonly done: TaskList;
	private readonly backlogTitle: HTMLElement;
	private readonly columns: readonly HTMLElement[];
	private switching = 0;
	private place: Place = "calendar";

	constructor(
		private readonly host: LayoutHost,
		readonly layout: ViewLayout,
	) {
		const root = host.root;
		const shared = host.shared;
		shared.place(null, null);
		this.heads = new ColumnHeaders(root, { inboxName: () => host.listName("inbox"), soonName: () => host.listName("soon"), doneName: () => host.listName("done") });
		for (const head of this.heads.elements) this.parts.push(root.insertBefore(head, shared.nav));
		const left = this.part(shared.timeline, (parent) => el(parent, "div", "tc-left"));
		this.day = funnelList(host.lists, "day", { area: left, title: { el: () => shared.dayTitle, over: true } });
		const doneEl = this.part(shared.timeline, (parent) => el(parent, "div", "tc-done"));
		this.done = new TaskList(el(doneEl, "div"), {
			items: () => host.ribbon.done(),
			day: () => null,
			onCard: (card, item, _subtree, signal) => host.ribbon.doneCard(card, item, signal),
		});
		this.line("is-done");
		const inboxEl = this.part(shared.timeline, (parent) => el(parent, "div", "tc-inbox"));
		const inboxPane = el(inboxEl, "div", "tc-pane is-inbox");
		const backlogPane = el(inboxEl, "div", "tc-pane is-backlog");
		this.inbox = funnelList(host.lists, "inbox", { area: inboxPane, title: { el: () => this.heads.titleOf("inbox"), over: true } });
		this.backlogTitle = el(el(backlogPane, "div", "tc-pane-head"), "div", "tc-head-title");
		this.backlog = funnelList(host.lists, "backlog", { area: backlogPane, title: { el: () => this.backlogTitle, over: false } });
		const soonEl = this.part(shared.timeline, (parent) => el(parent, "div", "tc-soon"));
		this.soon = funnelList(host.lists, "soon", { area: soonEl, title: { el: () => this.heads.titleOf("soon"), over: true } });
		this.line("is-inbox");
		this.line(null);
		const handle = this.part(shared.timeline, (parent) => el(parent, "div"));
		new Divider(handle, {
			width: () => shownListWidth(host.share(), host.stageWidth()),
			onWidth: (at) => root.style.setProperty(PROPERTY.listWidth, px(at)),
			onRelease: (at) => host.saveShare(listShareOf(at, host.stageWidth())),
			min: LIST_WIDTHS.min,
			max: () => listWidthMax(host.stageWidth()),
			center: () => centeredListWidth(host.stageWidth()),
			onSnap: () => host.tap(),
			arbiter: host.arbiter,
		});
		this.columns = [left, doneEl, inboxEl, soonEl];
		this.track = (shift) => this.trackTo(shift);
	}

	/** A part of the strip, put on the screen before `before` as the strip has always stood. */
	private part(before: HTMLElement, make: (parent: null) => HTMLElement): HTMLElement {
		const part = make(null);
		this.host.root.insertBefore(part, before);
		this.parts.push(part);
		return part;
	}

	/** A fixed line between two halves. */
	private line(kind: "is-done" | "is-inbox" | null): void {
		const line = this.part(this.host.shared.timeline, (parent) => el(parent, "div", `tc-divider is-fixed${kind ? ` ${kind}` : ""}`));
		el(line, "div", "tc-divider-line");
	}

	/**
	 * A swipe walks the row of places as the wheel and the arrows do: to the next pair of columns the strip slides under
	 * the finger, to another day each column turns to that day's within itself, and past the row's end it only gives.
	 */
	private trackTo(shift: Shift): ScreenTrack {
		const root = this.host.root;
		const ribbon = this.host.ribbon;
		const from = { mode: ribbon.place(), date: ribbon.day() };
		const to = ribbon.stepFunnel(from, shift);
		if (!to) return new EdgeTrack(edgeParts(root, from.mode), root.clientWidth);
		if (to.mode === from.mode) return ribbon.dayTrack(to.date, shift);
		window.clearTimeout(this.switching);
		root.classList.remove("is-switching");
		return new StripTrack({
			root,
			from: from.mode,
			to: to.mode,
			showMode: (place) => this.classes(place),
			turnWheel: (position) => ribbon.follow(position),
			onArrive: (place) => ribbon.arrive(place),
		});
	}

	render(motion: LayoutMotion): void {
		const moving = motion === "move";
		for (const { list } of [this.day, this.inbox, this.backlog, this.soon]) list.render(moving);
		this.done.render(moving);
		this.frame();
	}

	frame(): void {
		const width = this.host.stageWidth();
		if (width > 0) this.host.root.style.setProperty(PROPERTY.listWidth, px(shownListWidth(this.host.share(), width)));
		this.heads.render();
		this.backlogTitle.textContent = this.host.listName("backlog");
	}

	/** The strip stands at `place`; `slide` moves it there in step with the wheel's pill. */
	showPlace(place: Place, slide: boolean): void {
		const root = this.host.root;
		if (slide && place !== this.place) {
			window.clearTimeout(this.switching);
			root.classList.add("is-switching");
			this.switching = window.setTimeout(() => root.classList.remove("is-switching"), tokenMs(root, DURATION.slide));
		}
		this.place = place;
		this.classes(place);
	}

	private classes(place: Place): void {
		const root = this.host.root;
		root.classList.toggle("is-lists", place === "soon");
		root.classList.toggle("is-inbox", place === "inbox" || place === "done");
		root.classList.toggle("is-done", place === "done");
	}

	/** The two columns each place shows, as places to drop; the timeline, the screen's, stands at the calendar's. */
	drops(): readonly LayoutDrop[] {
		if (this.place === "calendar") return [this.day.drop];
		if (this.place === "soon") return [this.soon.drop, this.day.drop];
		return [this.inbox.drop, this.backlog.drop, this.soon.drop];
	}

	timelineShows(): boolean {
		return this.place === "calendar";
	}

	listOf(column: ListColumn): TaskList | null {
		return { day: this.day, inbox: this.inbox, backlog: this.backlog, soon: this.soon }[column].list;
	}

	projects(): null {
		return null;
	}

	titleOf(column: "day" | "inbox" | "soon" | "backlog"): HTMLElement | null {
		if (column === "day") return this.host.shared.dayTitle;
		return column === "backlog" ? this.backlogTitle : this.heads.titleOf(column);
	}

	dayLane(): HTMLElement {
		return this.columns[0];
	}

	scroller(): null {
		return null;
	}

	hold(): void {}

	hide(missing: boolean): void {
		for (const column of this.columns) column.classList.toggle("tc-hidden", missing);
	}

	destroy(): void {
		window.clearTimeout(this.switching);
		for (const { list } of [this.day, this.inbox, this.backlog, this.soon]) list.destroy();
		this.done.destroy();
		for (const part of this.parts) part.remove();
		this.host.root.classList.remove(...PLACES);
	}
}
