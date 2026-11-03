import type { GroupName, TaskItem } from "../../application/contracts";
import type { PriorityLevel } from "../../settings";
import { tokenPx } from "../design";
import { clear, el, px } from "../dom";
import { fillCard } from "../TaskCard";
import type { LocalDate, TaskStatus } from "../types";
import { backRow, menuGroup, menuRow, type MenuTileSpec, menuRoom, placePanel, tileGroup } from "./MenuPanel";
import { MonthPicker } from "./MonthPicker";
import { Overlay } from "./Overlay";
import { canRemoveDue, type MoveTile, type MoveTileId, moveTiles } from "./quickMoves";
import { tileRows, type LevelTile, type SectionChoice } from "./TaskMenu";

/** "3 tasks". */
export function countLabel(count: number): string {
	return count === 1 ? "1 task" : `${count} tasks`;
}

/** In progress, unless every task already is: then Stop progress. */
export function bulkProgress(items: readonly TaskItem[]): { readonly label: string; readonly status: TaskStatus } {
	const all = items.every((item) => item.status === "inProgress");
	return all ? { label: "Stop progress", status: "todo" } : { label: "In progress", status: "inProgress" };
}

/** The levels, the one every task shares on; with mixed levels none is. */
export function bulkLevelTiles(items: readonly TaskItem[], levels: readonly PriorityLevel[]): readonly LevelTile[] {
	const shared = items[0]?.priority?.prefix ?? null;
	const same = items.every((item) => (item.priority?.prefix ?? null) === shared);
	return levels.map((level) => ({ prefix: level.prefix, color: level.color, on: same && level.prefix === shared }));
}

/** A tap on the level every task shares takes it off them all; any other level goes on all. */
export function bulkNextPriority(items: readonly TaskItem[], prefix: string): string | null {
	return items.every((item) => item.priority?.prefix === prefix) ? null : prefix;
}

/** Today and Tomorrow, unless every task already stands on that day, and Pick a date. */
export function bulkMoveTiles(items: readonly TaskItem[], today: LocalDate): readonly MoveTile[] {
	const offered = items.flatMap((item) => moveTiles(item, today));
	return MOVE_ORDER.flatMap((id) => offered.find((tile) => tile.id === id) ?? []);
}

const MOVE_ORDER: readonly MoveTileId[] = ["today", "tomorrow", "pick"];

/** Remove due date, when some task has one to take off. */
export function bulkCanRemoveDue(items: readonly TaskItem[], today: LocalDate): boolean {
	return items.some((item) => canRemoveDue(today, item.dueDate));
}

export interface BulkActions {
	setStatus(status: TaskStatus): Promise<void>;
	setPriority(prefix: string | null): Promise<void>;
	postpone(date: LocalDate): Promise<void>;
	removeDue(): Promise<void>;
	toSection(name: GroupName): Promise<void>;
	remove(): Promise<void>;
}

export interface BulkMenuContext {
	readonly items: readonly TaskItem[];
	/** The picked tasks' cards: each stays over the blur where it stands. */
	readonly cards: readonly HTMLElement[];
	/** The card clicked: the panel stands beside the list, level with it. */
	readonly source: HTMLElement;
	readonly today: LocalDate;
	readonly day: LocalDate;
	readonly levels: readonly PriorityLevel[];
	/** The sections the tasks can go to, only when they all stand in one list that shows them; `shared`: all stand in its current one. */
	readonly sections?: { readonly choice: SectionChoice; readonly shared: boolean };
	readonly actions: BulkActions;
	onClose(): void;
}

/**
 * The menu for every picked task at once (bulk actions spec): their cards stay over the blur where they stand, so the
 * panel opens beside the list instead of under the card. It has what makes sense for many: status, priority, the
 * moves, the section and Delete.
 */
export class BulkMenu {
	private readonly overlay: Overlay;
	private readonly panel: HTMLElement;
	private readonly anchor: DOMRect;

	static open(context: BulkMenuContext): BulkMenu {
		return new BulkMenu(context);
	}

	private constructor(private readonly context: BulkMenuContext) {
		this.overlay = new Overlay(() => this.close());
		const rects = context.cards.map((card) => card.getBoundingClientRect());
		this.anchor = this.besideList(context.source);
		context.cards.forEach((card, i) => this.lift(card, rects[i]));
		this.panel = this.overlay.add(el(null, "div", "tc-panel is-task is-bulk"), true);
		this.showMenu();
		this.overlay.show();
	}

	/** A copy of a picked card over the blur, at `rect`, where the card stands, read before any copy; cards out of sight have none. */
	private lift(card: HTMLElement, rect: DOMRect): void {
		if (rect.width === 0 || rect.bottom < 0 || rect.top > window.innerHeight) return;
		const item = this.context.items[this.context.cards.indexOf(card)];
		const copy = this.overlay.add(el(null, "div", "tc-lifted is-selected"), true);
		fillCard(copy, item, { day: this.context.day });
		copy.style.left = px(rect.left);
		copy.style.top = px(rect.top);
		copy.style.width = px(rect.width);
		copy.style.height = px(rect.height);
	}

	/** Right of the clicked card's list, its top level with the card. */
	private besideList(source: HTMLElement): DOMRect {
		const card = source.getBoundingClientRect();
		const column = source.closest(".tc-left, .tc-soon, .tc-inbox")?.getBoundingClientRect() ?? card;
		const gap = tokenPx(source, "--tc-menu-gap");
		return new DOMRect(column.right + gap, card.top - gap, 0, 0);
	}

	private place(): void {
		placePanel(this.panel, this.anchor, tokenPx(this.panel, "--tc-menu-gap"), menuRoom());
	}

	private pick(action: () => Promise<void>): () => void {
		return () => {
			this.close();
			void action();
		};
	}

	private showMenu(): void {
		clear(this.panel);
		this.panel.classList.remove("is-picker");
		const { items, actions, levels, today } = this.context;
		el(this.panel, "div", "tc-menu-title", countLabel(items.length));
		const progress = bulkProgress(items);
		const statuses: MenuTileSpec[] = [
			{ label: "Done", icon: "done", onPick: this.pick(() => actions.setStatus("done")) },
			{ label: progress.label, icon: "progress", onPick: this.pick(() => actions.setStatus(progress.status)) },
			{ label: "Won’t do", icon: "wontdo", onPick: this.pick(() => actions.setStatus("cancelled")) },
		];
		tileGroup(this.panel, "is-status", [statuses]);
		const levelTiles = bulkLevelTiles(items, levels).map((tile): MenuTileSpec => ({ label: tile.prefix, icon: "priority", color: tile.color, on: tile.on, onPick: this.pick(() => actions.setPriority(bulkNextPriority(items, tile.prefix))) }));
		if (levelTiles.length > 0) tileGroup(this.panel, "is-priority", tileRows(levelTiles));
		const moves = bulkMoveTiles(items, today).map(({ label, icon, date }): MenuTileSpec => ({ label, icon, onPick: date === null ? () => this.showPicker() : this.pick(() => actions.postpone(date)) }));
		tileGroup(this.panel, "is-move", [moves]);
		if (this.context.sections) menuGroup(this.panel, [{ label: "Section", icon: "section", onPick: () => this.showSections() }]);
		menuRow(this.panel, { label: `Delete ${countLabel(items.length)}`, icon: "delete", danger: true, onPick: this.pick(() => actions.remove()) }, "tc-menu-row is-tall is-apart");
		this.place();
	}

	/** The sections of the tasks' list; the one they all stand in checked. */
	private showSections(): void {
		if (!this.context.sections) return;
		const { choice, shared } = this.context.sections;
		clear(this.panel);
		const { actions } = this.context;
		backRow(this.panel, "Section", () => this.showMenu());
		const group = menuGroup(this.panel, []);
		const checked = (name: GroupName) => (shared && name === choice.current ? "check" : undefined);
		for (const name of choice.names) menuRow(group, { label: name, icon: checked(name), onPick: this.pick(() => actions.toSection(name)) }, "tc-menu-row is-choice");
		menuRow(group, { label: choice.ungrouped, icon: checked(null), onPick: this.pick(() => actions.toSection(null)) }, "tc-menu-row is-choice is-quiet");
		this.place();
	}

	private showPicker(): void {
		clear(this.panel);
		this.panel.classList.add("is-picker");
		const { items, actions, today } = this.context;
		const shared = items.every((item) => item.dueDate === items[0].dueDate) ? items[0].dueDate : null;
		new MonthPicker(el(this.panel, "div"), { month: shared ?? today, today, selected: shared, onPick: (date) => this.pick(() => actions.postpone(date))() });
		if (bulkCanRemoveDue(items, today)) menuRow(this.panel, { label: "Remove due date", icon: "removeDue", onPick: this.pick(() => actions.removeDue()) }, "tc-menu-row tc-picker-remove");
		this.place();
	}

	close(): void {
		if (this.overlay.close()) this.context.onClose();
	}
}
