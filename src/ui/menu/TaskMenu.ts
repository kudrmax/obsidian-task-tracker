import type { TaskItem } from "../../application/contracts";
import type { PriorityLevel } from "../../settings";
import { dayMonth } from "../dates";
import { tokenPx } from "../design";
import { clear, el, px } from "../dom";
import { fillCard, renderTaskCard } from "../TaskCard";
import { grownStart, roomWidth, showWhole, windowRoom } from "../wholeCard";
import type { LocalDate, TaskStatus } from "../types";
import { Overlay } from "./Overlay";
import { dueOptions } from "./dueOptions";
import { backRow, menuGroup, type MenuRowSpec, menuRow, type MenuTileSpec, placePanel, tileGroup } from "./MenuPanel";
import type { MenuIconName } from "./menuIcons";
import { MonthPicker } from "./MonthPicker";

export type StatusTileId = "done" | "progress" | "wontdo";
export type EditRowId = "rename" | "due" | "subtask";

export interface StatusTile {
	readonly id: StatusTileId;
	readonly label: string;
	readonly icon: MenuIconName;
}

export interface EditRow {
	readonly id: EditRowId;
	readonly label: string;
	readonly value: string;
	readonly icon: MenuIconName;
}

/** The status group: Done first, the most used. */
export function statusTiles(item: TaskItem): readonly StatusTile[] {
	return [
		{ id: "done", label: "Done", icon: "done" },
		{ id: "progress", label: item.status === "inProgress" ? "Stop progress" : "In progress", icon: "progress" },
		{ id: "wontdo", label: "Won’t do", icon: "wontdo" },
	];
}

/** The edit group: Rename, the due date with the date beside it, a subtask. */
export function editRows(item: TaskItem): readonly EditRow[] {
	return [
		{ id: "rename", label: "Rename", value: "", icon: "rename" },
		{ id: "due", label: "Due date", value: item.dueDate ? dayMonth(item.dueDate) : "", icon: "due" },
		{ id: "subtask", label: "Add subtask", value: "", icon: "subtask" },
	];
}

export interface LevelTile extends PriorityLevel {
	readonly on: boolean;
}

/** The priority group's tiles, in the settings' order, the task's own on. */
export function priorityTiles(item: TaskItem, levels: readonly PriorityLevel[]): readonly LevelTile[] {
	return levels.map((level) => ({ prefix: level.prefix, color: level.color, on: level.prefix === item.priority?.prefix }));
}

/** A tap on a level sets it; on the task's own level it takes the priority off. */
export function nextPriority(item: TaskItem, prefix: string): string | null {
	return item.priority?.prefix === prefix ? null : prefix;
}

const TILES_PER_ROW = 3;

/** Tiles in rows of at most three, as even as they go: four make two and two, five three and two. */
export function tileRows<T>(tiles: readonly T[]): readonly (readonly T[])[] {
	if (tiles.length === 0) return [];
	const perRow = Math.ceil(tiles.length / Math.ceil(tiles.length / TILES_PER_ROW));
	const rows: T[][] = [];
	for (let i = 0; i < tiles.length; i += perRow) rows.push(tiles.slice(i, i + perRow));
	return rows;
}

export interface MenuActions {
	setStatus(status: TaskStatus): Promise<void>;
	setDueDate(date: LocalDate | null): Promise<void>;
	setPriority(prefix: string | null): Promise<void>;
	rename(): void;
	addSubtask(): void;
	remove(): Promise<void>;
}

export interface TaskMenuContext {
	readonly item: TaskItem;
	/** The card or block tapped; a copy of it stays over the backdrop, grown only to show a title the card cuts. */
	readonly source: HTMLElement;
	readonly today: LocalDate;
	/** The day on screen: the copy of a card leaves out a due date on it, as the list does. */
	readonly day: LocalDate;
	/** The priority levels the submenu offers. */
	readonly levels: readonly PriorityLevel[];
	readonly actions: MenuActions;
	/** Dresses the copy over the blur: a selected timeline card gives its copy the dots that stretch it. */
	readonly lifted?: (copy: HTMLElement, close: () => void) => void;
	/** `picker`: the menu opens on its date picker (a card dropped on Pick a date). */
	readonly opening?: "picker";
	/** A timeline card's subtasks stand between its copy and the panel; a tap on one opens its own menu instead. */
	readonly onSubtask?: (subtask: TaskItem, card: HTMLElement) => void;
}

/**
 * The task menu over a blurred screen: the tapped card stays as it is above the blur, a timeline card with its subtasks
 * under it, and the panel grows out under them; the due submenu and the month picker take its place.
 */
export class TaskMenu {
	private readonly overlay: Overlay;
	private readonly lifted: HTMLElement;
	private readonly panel: HTMLElement;
	private readonly anchor: DOMRect;

	static open(context: TaskMenuContext): TaskMenu {
		return new TaskMenu(context);
	}

	private constructor(private readonly context: TaskMenuContext) {
		this.overlay = new Overlay(() => this.close());
		this.lifted = this.overlay.add(el(null, "div", "tc-lifted"));
		if (context.source.classList.contains("tc-block")) {
			this.lifted.classList.add("is-block");
			this.lifted.appendChild(context.source.cloneNode(true));
		} else fillCard(this.lifted, context.item, { day: context.day });
		const copy = this.liftWhole(context.source.getBoundingClientRect());
		this.anchor = context.source.classList.contains("tc-block") && context.item.subtasks.length > 0 ? this.showSubtasks(copy) : copy;
		context.lifted?.(this.lifted, () => this.close());
		this.panel = this.overlay.add(el(null, "div", "tc-panel is-task"));
		if (context.opening === "picker") this.showPicker();
		else this.showMenu();
		this.overlay.show();
	}

	/** The copy stands where the card does; a title the card cuts grows it past the column, kept inside the window, and the panel goes by the copy. */
	private liftWhole(card: DOMRect): DOMRect {
		const room = windowRoom(this.lifted);
		const size = showWhole(this.lifted, card, roomWidth(room));
		const left = grownStart(card.left, card.width, size.width, room.width, room.margin);
		const top = grownStart(card.top, card.height, size.height, room.height, room.margin);
		this.lifted.style.left = px(left);
		this.lifted.style.top = px(top);
		return new DOMRect(left, top, size.width, size.height);
	}

	/** The open subtasks of a timeline card, under its copy at its width; the panel then goes by them. */
	private showSubtasks(copy: DOMRect): DOMRect {
		const { item, day, onSubtask } = this.context;
		const list = this.overlay.add(el(null, "div", "tc-menu-subtasks"));
		list.style.left = px(copy.left);
		list.style.top = px(copy.bottom);
		list.style.width = px(copy.width);
		for (const subtask of item.subtasks) {
			const card = renderTaskCard(list, subtask, { day });
			card.addEventListener("click", () => {
				this.close();
				onSubtask?.(subtask, card);
			});
		}
		return new DOMRect(copy.left, copy.top, copy.width, list.getBoundingClientRect().bottom - copy.top);
	}

	private place(): void {
		placePanel(this.panel, this.anchor, tokenPx(this.panel, "--tc-menu-gap"), window.innerHeight);
	}

	private pick(action: () => void | Promise<void>): () => void {
		return () => {
			this.close();
			void action();
		};
	}

	private showMenu(): void {
		clear(this.panel);
		this.panel.classList.remove("is-picker");
		const { item, actions, levels } = this.context;
		const nextStatus: TaskStatus = item.status === "inProgress" ? "todo" : "inProgress";
		const statuses: Record<StatusTileId, () => void> = {
			done: this.pick(() => actions.setStatus("done")),
			progress: this.pick(() => actions.setStatus(nextStatus)),
			wontdo: this.pick(() => actions.setStatus("cancelled")),
		};
		const edits: Record<EditRowId, () => void> = {
			rename: this.pick(() => actions.rename()),
			due: () => this.showDue(),
			subtask: this.pick(() => actions.addSubtask()),
		};
		tileGroup(this.panel, "is-status", [statusTiles(item).map((tile): MenuTileSpec => ({ label: tile.label, icon: tile.icon, onPick: statuses[tile.id] }))]);
		const levelTiles = priorityTiles(item, levels).map((tile): MenuTileSpec => ({ label: tile.prefix, icon: "priority", color: tile.color, on: tile.on, onPick: this.pick(() => actions.setPriority(nextPriority(item, tile.prefix))) }));
		if (levelTiles.length > 0) tileGroup(this.panel, "is-priority", tileRows(levelTiles));
		menuGroup(this.panel, editRows(item).map((row): MenuRowSpec => ({ label: row.label, value: row.value, icon: row.icon, onPick: edits[row.id] })));
		menuRow(this.panel, { label: "Delete", icon: "delete", danger: true, onPick: this.pick(() => actions.remove()) }, "tc-menu-row is-tall is-apart");
		this.place();
	}

	private showDue(): void {
		clear(this.panel);
		this.panel.classList.remove("is-picker");
		const { item, actions, today } = this.context;
		const options = dueOptions(today, item.dueDate);
		backRow(this.panel, "Due date", () => this.showMenu());
		const choose = (date: LocalDate) => this.pick(() => actions.setDueDate(date));
		menuGroup(this.panel, [
			{ label: "Today", value: options.today.label, onPick: choose(options.today.value) },
			{ label: "Tomorrow", value: options.tomorrow.label, onPick: choose(options.tomorrow.value) },
			{ label: "Next week", value: options.nextWeek.label, onPick: choose(options.nextWeek.value) },
			{ label: "Pick a date", value: options.pick.label, onPick: () => this.showPicker() },
		]);
		if (options.canRemove) menuRow(this.panel, { label: "Remove due date", icon: "removeDue", onPick: this.pick(() => actions.setDueDate(null)) }, "tc-menu-row is-tall is-apart");
		this.place();
	}

	private showPicker(): void {
		clear(this.panel);
		this.panel.classList.add("is-picker");
		const { item, actions, today } = this.context;
		new MonthPicker(el(this.panel, "div"), {
			month: item.dueDate ?? today,
			today,
			selected: item.dueDate,
			onPick: (date) => this.pick(() => actions.setDueDate(date))(),
			variant: "menu",
		});
		if (dueOptions(today, item.dueDate).canRemove) {
			menuRow(this.panel, { label: "Remove due date", icon: "removeDue", onPick: this.pick(() => actions.setDueDate(null)) }, "tc-menu-row tc-picker-remove");
		}
		this.place();
	}

	close(): void {
		this.overlay.close();
	}
}
