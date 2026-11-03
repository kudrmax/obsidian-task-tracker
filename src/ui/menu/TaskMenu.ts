import type { GroupName, TaskItem } from "../../application/contracts";
import type { PriorityLevel } from "../../settings";
import { LAYOUT } from "../design";
import { clear, el, px } from "../dom";
import { fillCard, renderTaskCard, renderUnwrittenCard, showMeta, showProgressDot } from "../TaskCard";
import { linkAt, type TaskLink } from "../TaskTitle";
import { showWhole } from "../wholeCard";
import type { LocalDate, TaskStatus } from "../types";
import type { CloseHow } from "./Overlay";
import { LiftedMenu } from "./LiftedMenu";
import { canRemoveDue, moveTiles } from "./quickMoves";
import { askGroup, backRow, menuGroup, type MenuRowSpec, menuRow, type MenuTileSpec, tileGroup } from "./MenuPanel";
import { plainText } from "../../application/taskText";
import type { MenuIconName } from "./menuIcons";
import { MonthPicker } from "./MonthPicker";
import type { MarkdownSurface } from "../markdown/MarkdownSurface";
import { DescriptionPeek } from "./DescriptionPeek";

export type StatusTileId = "done" | "progress" | "wontdo";
export type EditRowId = "rename" | "description" | "section" | "subtask";
type Asking = "delete" | "wontdo";

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

/** Where in its list's sections a task can go: a list card's menu has them; a subtask, a timeline card or a done task none. */
export interface SectionChoice {
	/** The sections the list has, in its order, then the presets it lacks, in the settings' order. */
	readonly names: readonly string[];
	readonly current: GroupName;
	/** The name of the tasks outside any section. */
	readonly ungrouped: string;
}

/** The edit group: Rename, Add description for a task without one, the section with its name beside it, a subtask. */
export function editRows(item: TaskItem, sections: SectionChoice | null = null): readonly EditRow[] {
	return [
		{ id: "rename", label: "Rename", value: "", icon: "rename" },
		...(item.description === null ? [{ id: "description", label: "Add description", value: "", icon: "description" } as const] : []),
		...(sections ? [{ id: "section", label: "Section", value: sections.current ?? "", icon: "section" } as const] : []),
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
	/** Puts the task off to `date`: due that day, no slot, at the end of Now for today, of Soon for a later day. */
	postpone(date: LocalDate): Promise<void>;
	removeDue(): Promise<void>;
	/** To the end of that section of its list; null: among the tasks outside any. */
	toSection(name: GroupName): Promise<void>;
	/** The task waits at the end of its list under a field for the new section's name. */
	newSection(): void;
	setPriority(prefix: string | null): Promise<void>;
	/** The menu of a card in a calendar menu's stack stays open for it, its card may become the field (`openRename`); any other has closed. */
	rename(menu: TaskMenu): void;
	/** The description's screen: to read it, or straight in the editor. */
	openDescription(editing: boolean): void;
	/** A timeline card's menu stays open for it, its stack may take the field (`openStack`); any other has closed. */
	addSubtask(menu: TaskMenu): void;
	remove(): Promise<void>;
	/** The tasks file in Obsidian's editor, the cursor on the task's line. */
	openInObsidian(): void;
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
	/** The sections a list card can go to; none for any other. */
	readonly sections?: SectionChoice;
	/** A timeline card's subtasks stand between its copy and the panel; a tap on one opens its own menu instead. */
	readonly onSubtask?: (subtask: TaskItem, card: HTMLElement) => void;
	/** Draws the start of the task's description over its copy; without it the menu shows none. */
	readonly markdown?: MarkdownSurface;
}

/**
 * The task menu over a blurred screen: the tapped card stays as it is above the blur, a timeline card with its subtasks
 * under it, and the panel grows out under them; the sections and the month picker take its place.
 */
export class TaskMenu extends LiftedMenu {
	private panel!: HTMLElement;
	/** The first groups of a panel too tall for either side of the card, over the card; hidden while the panel is whole. */
	private upper!: HTMLElement;
	private anchor!: DOMRect;
	/** A timeline card's subtasks under its copy; none until there are some or a new one is typed there. */
	private stack: HTMLElement | null = null;
	private stackRow: HTMLElement | null = null;
	/** The card turned into the field's row, in place of the copy. */
	private fieldRow: HTMLElement | null = null;
	/** Whoever types in the menu hears when it closes, and how. */
	private fieldClosed: ((how: CloseHow) => void) | null = null;
	private peek: DescriptionPeek | null = null;
	/** What the menu asks about now, if anything; Enter confirms it, as its button does. */
	private asking: Asking | null = null;
	private confirmAsked: (() => void) | null = null;
	private readonly onEnter = (e: KeyboardEvent) => {
		if (e.key !== "Enter" || !this.confirmAsked) return;
		e.preventDefault();
		e.stopPropagation();
		this.confirmAsked();
	};

	static open(context: TaskMenuContext): TaskMenu {
		return new TaskMenu(context);
	}

	private constructor(private readonly context: TaskMenuContext) {
		super();
		this.openOver(context.source, () => this.build());
	}

	/** The copy over the blur, a timeline card's subtasks under it, and the panel. */
	private build(): void {
		const context = this.context;
		if (context.source.classList.contains("tc-block")) {
			this.lifted.classList.add("is-block");
			this.lifted.appendChild(context.source.cloneNode(true));
		} else fillCard(this.lifted, context.item, { day: context.day });
		const copy = this.liftWhole(context.source, showWhole);
		this.anchor = this.stacks && context.item.subtasks.length > 0 ? this.showSubtasks(copy) : copy;
		context.lifted?.(this.lifted, () => this.close());
		this.lifted.addEventListener("click", (e) => this.followLink(e));
		this.panel = this.addPanel("is-task");
		this.upper = this.addPanel("is-task");
		this.upper.hidden = true;
		this.peek = this.peekOf(context);
		this.showMenu();
	}

	/** A link is followed from the copy only, never from the card itself: a tap on the card can't open it by chance. */
	private followLink(e: MouseEvent): void {
		const link = linkAt(e.target);
		if (!link) return;
		e.preventDefault();
		e.stopPropagation();
		this.pick(() => this.context.actions.openLink(link))();
	}

	/** The menu of a timeline card: its subtasks stand in a stack under its copy. */
	get stacks(): boolean {
		return this.context.source.classList.contains("tc-block");
	}

	/** The menu of a subtask tapped in a calendar menu's stack. */
	get inStack(): boolean {
		return this.context.source.closest(".tc-menu-subtasks") !== null;
	}

	/** The stack and the field's row go up with the copy: a field kept over the keyboard. */
	override raise(by: number): void {
		super.raise(by);
		const top = this.copy.top - this.raisedBy;
		if (this.fieldRow) this.fieldRow.style.top = px(top);
		if (this.stack) this.stack.style.top = px(this.copy.bottom - this.raisedBy);
	}

	/**
	 * Rename on a card of a calendar menu's stack: the panel and the copy go, and the card becomes a row for the field in
	 * its place, the dot of a task in progress kept; this returns the row. `onClose` hears when the menu closes, and how.
	 */
	openRename(onClose: (how: CloseHow) => void): HTMLElement {
		this.giveToField();
		this.fieldClosed = onClose;
		this.lifted.style.visibility = "hidden";
		const row = (this.fieldRow ??= this.overlay.add(el(null, "div", "tc-menu-field tc-quick-row"), true));
		row.style.left = px(this.copy.left);
		row.style.width = px(this.copy.width);
		showProgressDot(row, this.context.item);
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
		this.upper.hidden = true;
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
		const stack = this.overlay.add(el(null, "div", "tc-menu-subtasks"), true);
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

	/** A menu split over and under the card leaves no side to the description, which then stays away. */
	private place(keepAbove?: number): void {
		this.placeBy(this.panel, this.anchor, this.upper, keepAbove);
		if (this.upper.hidden) this.peek?.place(this.anchor, this.panel);
		else this.peek?.hide();
	}

	private showMenu(keepAbove?: number): void {
		clear(this.panel);
		clear(this.upper);
		this.panel.classList.remove("is-picker");
		const { item, actions, levels } = this.context;
		const nextStatus: TaskStatus = item.status === "inProgress" ? "todo" : "inProgress";
		const statuses: Record<StatusTileId, () => void> = {
			done: this.pick(() => actions.setStatus("done")),
			progress: this.pick(() => actions.setStatus(nextStatus)),
			wontdo: () => this.askFor("wontdo"),
		};
		const edits: Record<EditRowId, () => void> = {
			rename: this.inStack ? () => actions.rename(this) : this.pick(() => actions.rename(this)),
			description: this.pick(() => actions.openDescription(true)),
			section: () => this.showSections(),
			subtask: this.stacks ? () => actions.addSubtask(this) : this.pick(() => actions.addSubtask(this)),
		};
		if (this.asking === "wontdo") this.askGroup("wontdo");
		else tileGroup(this.panel, "is-status", [statusTiles(item).map((tile): MenuTileSpec => ({ label: tile.label, icon: tile.icon, onPick: statuses[tile.id] }))]);
		const levelTiles = priorityTiles(item, levels).map((tile): MenuTileSpec => ({ label: tile.prefix, icon: "priority", color: tile.color, on: tile.on, onPick: this.pick(() => actions.setPriority(nextPriority(item, tile.prefix))) }));
		if (levelTiles.length > 0) tileGroup(this.panel, "is-priority", tileRows(levelTiles));
		const moves = moveTiles(item, this.context.today).map(({ label, icon, date }): MenuTileSpec => ({
			label,
			icon,
			onPick: date === null ? () => this.showPicker() : this.pick(() => actions.postpone(date)),
		}));
		if (moves.length > 0) tileGroup(this.panel, "is-move", [moves]);
		const rows = editRows(item, this.context.sections ?? null).filter((row) => !(this.inStack && row.id === "subtask"));
		menuGroup(this.panel, rows.map((row): MenuRowSpec => ({ label: row.label, value: row.value, icon: row.icon, onPick: edits[row.id] })));
		menuRow(this.panel, { label: "Open in Obsidian", icon: "openFile", onPick: this.pick(() => actions.openInObsidian()) }, "tc-menu-row is-tall is-apart");
		if (this.asking === "delete") this.askGroup("delete");
		else menuRow(this.panel, { label: "Delete", icon: "delete", danger: true, onPick: () => this.askFor("delete") }, "tc-menu-row is-tall is-apart");
		this.place(keepAbove);
		this.panel.querySelector(".tc-menu-ask")?.scrollIntoView({ block: "nearest" });
	}

	/** Delete and Won’t do ask first, in place of what was pressed; the rest of the menu stays as it is. */
	private askFor(what: Asking | null, show = true): void {
		this.asking = what;
		this.confirmAsked = null;
		if (what === null) document.removeEventListener("keydown", this.onEnter, true);
		else document.addEventListener("keydown", this.onEnter, true);
		if (show) this.showMenu(this.groupsAbove());
	}

	/** How many of the panel's groups stand over the card now: a question takes the place of a group and moves none. */
	private groupsAbove(): number {
		if (this.panel.classList.contains("is-above")) return this.panel.children.length;
		return this.upper.hidden ? 0 : this.upper.children.length;
	}

	private askGroup(what: Asking): void {
		const { item, actions } = this.context;
		const del = what === "delete";
		const confirm = this.pick(() => (del ? actions.remove() : actions.setStatus("cancelled")));
		this.confirmAsked = confirm;
		askGroup(this.panel, {
			verb: del ? "Delete" : "Won’t do",
			title: plainText(item.text),
			confirm: del ? "Delete" : "Won’t do",
			icon: del ? "delete" : "wontdo",
			danger: del,
			onCancel: () => this.askFor(null),
			onConfirm: confirm,
		});
	}

	/** The sections of the task's list, its own checked, then the tasks outside any; New section asks for a name. */
	private showSections(): void {
		const sections = this.context.sections;
		if (!sections) return;
		this.askFor(null, false);
		clear(this.panel);
		clear(this.upper);
		const { item, actions } = this.context;
		backRow(this.panel, "Section", () => this.showMenu());
		const choose = (name: GroupName) => this.pick(() => (name === item.group ? undefined : actions.toSection(name)));
		const group = menuGroup(this.panel, []);
		for (const name of sections.names) menuRow(group, { label: name, icon: name === sections.current ? "check" : undefined, onPick: choose(name) }, "tc-menu-row is-choice");
		menuRow(group, { label: sections.ungrouped, icon: sections.current === null ? "check" : undefined, onPick: choose(null) }, "tc-menu-row is-choice is-quiet");
		menuRow(this.panel, { label: "New section", icon: "plus", onPick: this.pick(() => actions.newSection()) }, "tc-menu-row is-tall is-apart is-add");
		this.place();
	}

	private showPicker(): void {
		this.askFor(null, false);
		clear(this.panel);
		clear(this.upper);
		this.panel.classList.add("is-picker");
		const { item, actions, today } = this.context;
		new MonthPicker(el(this.panel, "div"), {
			month: item.dueDate ?? today,
			today,
			selected: item.dueDate,
			onPick: (date) => this.pick(() => actions.postpone(date))(),
		});
		if (canRemoveDue(today, item.dueDate)) {
			menuRow(this.panel, { label: "Remove due date", icon: "removeDue", onPick: this.pick(() => actions.removeDue()) }, "tc-menu-row tc-picker-remove");
		}
		this.place();
	}

	/**
	 * A second press anywhere within a double click of now, wherever the copy and the panel now stand: the menu goes and
	 * `then` runs; the press and its click reach nothing under it, so a tile can't be picked by chance.
	 */
	onClickedAgain(then: () => void): void {
		const until = performance.now() + LAYOUT.doubleClickMs;
		const stop = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
		};
		const press = (e: PointerEvent) => {
			window.removeEventListener("pointerdown", press, true);
			if (performance.now() > until) return;
			stop(e);
			window.addEventListener("click", stop, { capture: true, once: true });
			this.close();
			then();
		};
		window.addEventListener("pointerdown", press, true);
	}

	protected override closed(how: CloseHow): void {
		document.removeEventListener("keydown", this.onEnter, true);
		this.fieldClosed?.(how);
	}
}
