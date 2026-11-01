import type { TaskItem } from "../../application/contracts";
import type { PriorityLevel } from "../../settings";
import { dayMonth } from "../dates";
import { tokenPx } from "../design";
import { clear, el, px } from "../dom";
import { fillCard, renderTaskCard, renderUnwrittenCard, showMeta, showStrip } from "../TaskCard";
import { linkAt, type TaskLink } from "../TaskTitle";
import { grownStart, roomWidth, showWhole, windowRoom } from "../wholeCard";
import type { LocalDate, TaskStatus } from "../types";
import { type CloseHow, Overlay } from "./Overlay";
import { dueOptions } from "./dueOptions";
import { backRow, menuGroup, type MenuRowSpec, menuRow, type MenuTileSpec, placePanel, tileGroup } from "./MenuPanel";
import type { MenuIconName } from "./menuIcons";
import { MonthPicker } from "./MonthPicker";
import type { MarkdownSurface } from "../markdown/MarkdownSurface";
import { DescriptionPeek } from "./DescriptionPeek";

export type StatusTileId = "done" | "progress" | "wontdo";
export type EditRowId = "rename" | "description" | "due" | "subtask";

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

/** The edit group: Rename, Add description for a task without one, the due date with the date beside it, a subtask. */
export function editRows(item: TaskItem): readonly EditRow[] {
	return [
		{ id: "rename", label: "Rename", value: "", icon: "rename" },
		...(item.description === null ? [{ id: "description", label: "Add description", value: "", icon: "description" } as const] : []),
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
	/** The menu of a card in a calendar menu's stack stays open for it, its card may become the field (`openRename`); any other has closed. */
	rename(menu: TaskMenu): void;
	/** The description's screen: to read it, or straight in the editor. */
	openDescription(editing: boolean): void;
	/** A timeline card's menu stays open for it, its stack may take the field (`openStack`); any other has closed. */
	addSubtask(menu: TaskMenu): void;
	remove(): Promise<void>;
	openLink(link: TaskLink): void;
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
	/** Draws the start of the task's description over its copy; without it the menu shows none. */
	readonly markdown?: MarkdownSurface;
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
	private readonly copy: DOMRect;
	/** A timeline card's subtasks under its copy; none until there are some or a new one is typed there. */
	private stack: HTMLElement | null = null;
	private stackRow: HTMLElement | null = null;
	/** The card turned into the field's row, in place of the copy. */
	private fieldRow: HTMLElement | null = null;
	/** How far the parts over the blur stand above the card, to keep a field over the keyboard. */
	private raisedBy = 0;
	/** Whoever types in the menu hears when it closes, and how. */
	private fieldClosed: ((how: CloseHow) => void) | null = null;
	private readonly peek: DescriptionPeek | null;

	static open(context: TaskMenuContext): TaskMenu {
		return new TaskMenu(context);
	}

	private constructor(private readonly context: TaskMenuContext) {
		this.overlay = new Overlay((how) => this.close(how));
		this.lifted = this.overlay.add(el(null, "div", "tc-lifted"));
		if (context.source.classList.contains("tc-block")) {
			this.lifted.classList.add("is-block");
			this.lifted.appendChild(context.source.cloneNode(true));
		} else fillCard(this.lifted, context.item, { day: context.day });
		const copy = (this.copy = this.liftWhole(context.source.getBoundingClientRect()));
		this.anchor = this.stacks && context.item.subtasks.length > 0 ? this.showSubtasks(copy) : copy;
		context.lifted?.(this.lifted, () => this.close());
		this.lifted.addEventListener("click", (e) => this.followLink(e));
		this.panel = this.overlay.add(el(null, "div", "tc-panel is-task"));
		this.peek = this.peekOf(context);
		if (context.opening === "picker") this.showPicker();
		else this.showMenu();
		this.overlay.show();
	}

	/** A link is followed from the copy only, never from the card itself: a tap on the card can't open it by chance. */
	private followLink(e: MouseEvent): void {
		const link = linkAt(e.target);
		if (!link) return;
		e.preventDefault();
		e.stopPropagation();
		this.pick(() => this.context.actions.openLink(link))();
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

	/** The menu of a timeline card: its subtasks stand in a stack under its copy. */
	get stacks(): boolean {
		return this.context.source.classList.contains("tc-block");
	}

	/** The menu of a subtask tapped in a calendar menu's stack. */
	get inStack(): boolean {
		return this.context.source.closest(".tc-menu-subtasks") !== null;
	}

	get raised(): number {
		return this.raisedBy;
	}

	/** The copy, the stack and the field's row stand `by` px above the card, never below it: a field kept over the keyboard. */
	raise(by: number): void {
		this.raisedBy = Math.max(0, by);
		const top = this.copy.top - this.raisedBy;
		this.lifted.style.top = px(top);
		if (this.fieldRow) this.fieldRow.style.top = px(top);
		if (this.stack) this.stack.style.top = px(this.copy.bottom - this.raisedBy);
	}

	/**
	 * Rename on a card of a calendar menu's stack: the panel and the copy go, and the card becomes a row for the field in
	 * its place, the strip of a task in progress kept; this returns the row. `onClose` hears when the menu closes, and how.
	 */
	openRename(onClose: (how: CloseHow) => void): HTMLElement {
		this.giveToField();
		this.fieldClosed = onClose;
		this.lifted.style.visibility = "hidden";
		const row = (this.fieldRow ??= this.overlay.add(el(null, "div", "tc-menu-field tc-quick-row")));
		row.style.left = px(this.copy.left);
		row.style.width = px(this.copy.width);
		showStrip(row, this.context.item);
		this.raise(this.raisedBy);
		return row;
	}

	/**
	 * Add subtask on a timeline card: the panel goes, and the stack under the copy, opened when the task has no subtasks
	 * yet, ends in a row for the field of a new one, which this returns. `onClose` hears when the menu closes, and how.
	 */
	openStack(onClose: (how: CloseHow) => void): HTMLElement {
		this.giveToField();
		this.fieldClosed = onClose;
		const stack = (this.stack ??= this.stackUnder(this.copy));
		return (this.stackRow ??= el(stack, "div", "tc-quick-row"));
	}

	/** Typing in the menu: the panel and the start of the description go, the field and its bar take their place. */
	private giveToField(): void {
		this.panel.hidden = true;
		this.peek?.hide();
	}

	/**
	 * The stack shows `task`'s subtasks, then the texts typed and not yet written, over the field's row, which stays where
	 * it is; the copy's counter and description mark follow the task.
	 */
	showStack(task: TaskItem, pending: readonly string[]): void {
		const stack = this.stack;
		if (!stack) return;
		for (const child of [...stack.children]) if (child !== this.stackRow) child.remove();
		this.fillStack(stack, task.subtasks);
		const copy = this.lifted.querySelector<HTMLElement>(".tc-block-card");
		if (copy) showMeta(copy, task);
		for (const text of pending) stack.insertBefore(renderUnwrittenCard(null, text), this.stackRow);
	}

	/** The open subtasks of a timeline card, under its copy at its width; the panel then goes by them. */
	private showSubtasks(copy: DOMRect): DOMRect {
		const stack = (this.stack = this.stackUnder(copy));
		this.fillStack(stack, this.context.item.subtasks);
		return new DOMRect(copy.left, copy.top, copy.width, stack.getBoundingClientRect().bottom - copy.top);
	}

	private stackUnder(copy: DOMRect): HTMLElement {
		const stack = this.overlay.add(el(null, "div", "tc-menu-subtasks"));
		stack.style.left = px(copy.left);
		stack.style.top = px(copy.bottom);
		stack.style.width = px(copy.width);
		return stack;
	}

	/** A tap on a subtask's card opens its own menu instead. */
	private fillStack(stack: HTMLElement, subtasks: readonly TaskItem[]): void {
		const { day, onSubtask } = this.context;
		for (const subtask of subtasks) {
			const card = renderTaskCard(null, subtask, { day });
			stack.insertBefore(card, this.stackRow);
			card.addEventListener("click", () => {
				this.close();
				onSubtask?.(subtask, card);
			});
		}
	}

	/** The start of the description, over the copy; a tap on it reads the whole, a link in it opens as it is. */
	private peekOf(context: TaskMenuContext): DescriptionPeek | null {
		const { item, markdown, actions } = context;
		if (item.description === null || !markdown) return null;
		return new DescriptionPeek(this.overlay, markdown, item.description, {
			onRead: this.pick(() => actions.openDescription(false)),
			onLink: () => this.close(),
		});
	}

	private place(): void {
		placePanel(this.panel, this.anchor, tokenPx(this.panel, "--tc-menu-gap"), window.innerHeight);
		this.peek?.place(this.anchor, this.panel);
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
			rename: this.inStack ? () => actions.rename(this) : this.pick(() => actions.rename(this)),
			description: this.pick(() => actions.openDescription(true)),
			due: () => this.showDue(),
			subtask: this.stacks ? () => actions.addSubtask(this) : this.pick(() => actions.addSubtask(this)),
		};
		tileGroup(this.panel, "is-status", [statusTiles(item).map((tile): MenuTileSpec => ({ label: tile.label, icon: tile.icon, onPick: statuses[tile.id] }))]);
		const levelTiles = priorityTiles(item, levels).map((tile): MenuTileSpec => ({ label: tile.prefix, icon: "priority", color: tile.color, on: tile.on, onPick: this.pick(() => actions.setPriority(nextPriority(item, tile.prefix))) }));
		if (levelTiles.length > 0) tileGroup(this.panel, "is-priority", tileRows(levelTiles));
		const rows = editRows(item).filter((row) => !(this.inStack && row.id === "subtask"));
		menuGroup(this.panel, rows.map((row): MenuRowSpec => ({ label: row.label, value: row.value, icon: row.icon, onPick: edits[row.id] })));
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
		});
		if (dueOptions(today, item.dueDate).canRemove) {
			menuRow(this.panel, { label: "Remove due date", icon: "removeDue", onPick: this.pick(() => actions.setDueDate(null)) }, "tc-menu-row tc-picker-remove");
		}
		this.place();
	}

	/** `how`: Escape, or anything else that closed it. */
	close(how: CloseHow = "away"): void {
		if (this.overlay.close()) this.fieldClosed?.(how);
	}
}
