import { type GroupName, nextProgress, nextReminder, type PriorityLevel, type ReminderKind, type RepeatRule, sameRule, type TaskItem, type Weekday } from "../../application/contracts";
import { LAYOUT } from "../design";
import { clear, el, pinTo, px } from "../dom";
import { fillCard, renderTaskCard, renderUnwrittenCard, showMeta, showProgressDot } from "../TaskCard";
import { linkAt, type TaskLink } from "../TaskTitle";
import { showWhole } from "../wholeCard";
import type { LocalDate, TaskStatus } from "../types";
import type { CloseHow } from "./Overlay";
import { LiftedMenu } from "./LiftedMenu";
import { moveTiles } from "./quickMoves";
import { askGroup, menuGroup, type MenuRowSpec, menuRow, type MenuTileSpec, tileGroup, tileRows } from "./MenuPanel";
import type { IconName } from "../kit/icons";
import { datePage } from "./DatePage";
import { type SectionChoice, sectionChooser } from "./SectionChooser";
import type { MarkdownSurface } from "../markdown/MarkdownSurface";
import { DescriptionPeek } from "./DescriptionPeek";
import { repeatPanel } from "../repeat/RepeatPanel";
import { repeatValue } from "../repeat/repeatLabel";

export type StatusTileId = "done" | "progress" | "wontdo" | "stop";
export type EditRowId = "rename" | "reminder" | "description" | "repeat" | "section" | "subtask";
type Asking = "delete" | "wontdo" | "stop";

export interface StatusTile {
	readonly id: StatusTileId;
	readonly label: string;
	readonly icon: IconName;
}

export interface EditRow {
	readonly id: EditRowId;
	readonly label: string;
	readonly value: string;
	/** Repeat's value for a week: the days its letters show on. */
	readonly days?: readonly Weekday[] | null;
	readonly icon: IconName;
}

/** The progress tile's name for the status it sets: back to todo stops the progress. */
export function progressLabel(next: TaskStatus): string {
	return next === "todo" ? "Stop progress" : "In progress";
}

/** The status group: Done first, the most used; Stop last for a task that repeats. */
export function statusTiles(item: TaskItem): readonly StatusTile[] {
	return [
		{ id: "done", label: "Done", icon: "done" },
		{ id: "progress", label: progressLabel(nextProgress([item.status])), icon: "progress" },
		{ id: "wontdo", label: "Won’t do", icon: "wontdo" },
		...(item.repeat !== null && item.repeatable ? [{ id: "stop", label: "Stop", icon: "stop" } as const] : []),
	];
}

function repeatRow(rule: RepeatRule | null): EditRow {
	const weekly = rule !== null && rule.kind === "schedule" && rule.unit === "week";
	return { id: "repeat", label: "Repeat", value: rule === null ? "" : (repeatValue(rule) ?? ""), days: weekly ? rule.days : null, icon: "repeat" };
}

export type { SectionChoice } from "./SectionChooser";

const REMINDER_NAMES: Readonly<Record<ReminderKind, string>> = { notification: "Notification", alarm: "Alarm", none: "Off" };

/** The edit group: Rename, the reminder of a task on a time with its kind beside it, Add description for a task without one, Repeat with its rule, the section with its name beside it, a subtask. */
export function editRows(item: TaskItem, sections: SectionChoice | null = null): readonly EditRow[] {
	return [
		{ id: "rename", label: "Rename", value: "", icon: "rename" },
		...(item.can.remind ? [{ id: "reminder", label: "Reminder", value: REMINDER_NAMES[item.reminder], icon: "reminder" } as const] : []),
		...(item.description === null ? [{ id: "description", label: "Add description", value: "", icon: "description" } as const] : []),
		...(item.repeatable ? [repeatRow(item.repeat)] : []),
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
	setReminder(kind: ReminderKind): Promise<void>;
	/** The task repeats by `rule` from now on; null: it repeats no more. */
	setRepeat(rule: RepeatRule | null): Promise<void>;
	/** The task that repeats is closed with no next time. */
	stop(): Promise<void>;
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
	/** The rule the repeat page holds, written once as the menu closes; none untouched. */
	private repeatDraft: RepeatRule | null = null;
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
		this.panel = this.addPanel("is-task").el;
		this.upper = this.addPanel("is-task").el;
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
		this.lifted.classList.add("tc-invisible");
		const row = (this.fieldRow ??= this.overlay.add(el(null, "div", "tc-menu-field tc-quick-row"), true));
		pinTo(row, this.copy, { width: true });
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
		pinTo(stack, new DOMRect(copy.left, copy.bottom, copy.width), { width: true });
		return stack;
	}

	/** A tap on a subtask's card opens its own menu instead. */
	private fillStack(stack: HTMLElement, subtasks: readonly TaskItem[]): void {
		const { day, onSubtask } = this.context;
		for (const subtask of subtasks) {
			const card = renderTaskCard(null, subtask, { day });
			stack.insertBefore(card, this.stackRow);
			card.addEventListener("click", this.pick(() => onSubtask?.(subtask, card)));
		}
	}

	/** The start of the description, over the copy; a tap on it reads the whole, a link in it opens as it is. */
	private peekOf(context: TaskMenuContext): DescriptionPeek | null {
		const { item, markdown, actions } = context;
		if (item.description === null || !markdown) return null;
		return new DescriptionPeek(this.overlay, this.picks, markdown, item.description, {
			onRead: () => actions.openDescription(false),
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
		this.panel.classList.remove("is-picker", "is-repeat", "has-remove");
		const { item, actions, levels } = this.context;
		const statuses: Record<StatusTileId, () => void> = {
			done: this.pick(() => actions.setStatus("done")),
			progress: this.pick(() => actions.setStatus(nextProgress([item.status]))),
			wontdo: () => this.askFor("wontdo"),
			stop: () => this.askFor("stop"),
		};
		const edits: Record<EditRowId, () => void> = {
			rename: this.inStack ? () => actions.rename(this) : this.pick(() => actions.rename(this)),
			reminder: this.pick(() => actions.setReminder(nextReminder(item.reminder))),
			description: this.pick(() => actions.openDescription(true)),
			repeat: () => this.showRepeat(),
			section: () => this.showSections(),
			subtask: this.stacks ? () => actions.addSubtask(this) : this.pick(() => actions.addSubtask(this)),
		};
		const tiles = statusTiles(item);
		if (this.asking === "wontdo" || this.asking === "stop") this.askGroup(this.asking);
		else tileGroup(this.panel, tiles.length > 3 ? "is-status is-four" : "is-status", [tiles.map((tile): MenuTileSpec => ({ label: tile.label, icon: tile.icon, onPick: statuses[tile.id] }))]);
		const levelTiles = priorityTiles(item, levels).map((tile): MenuTileSpec => ({ label: tile.prefix, icon: "priority", color: tile.color, on: tile.on, onPick: this.pick(() => actions.setPriority(nextPriority(item, tile.prefix))) }));
		if (levelTiles.length > 0) tileGroup(this.panel, "is-priority", tileRows(levelTiles));
		const moves = moveTiles(item, this.context.today).map(({ label, icon, date }): MenuTileSpec => ({
			label,
			icon,
			onPick: date === null ? () => this.showPicker() : this.pick(() => actions.postpone(date)),
		}));
		if (moves.length > 0) tileGroup(this.panel, "is-move", [moves]);
		const rows = editRows(item, this.context.sections ?? null).filter((row) => !(this.inStack && row.id === "subtask"));
		menuGroup(this.panel, rows.map((row): MenuRowSpec => ({ label: row.label, value: row.value, days: row.days, icon: row.icon, onPick: edits[row.id] })));
		menuRow(this.panel, { label: "Open in Obsidian", icon: "openFile", size: "tall", apart: true, onPick: this.pick(() => actions.openInObsidian()) });
		if (this.asking === "delete") this.askGroup("delete");
		else menuRow(this.panel, { label: "Delete", icon: "delete", danger: true, size: "tall", apart: true, onPick: () => this.askFor("delete") });
		this.place(keepAbove);
		this.panel.querySelector(".tc-menu-ask")?.scrollIntoView({ block: "nearest" });
	}

	/** Delete, Won’t do and Stop ask first, in place of what was pressed; the rest of the menu stays as it is. */
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
		const questions: Record<Asking, { readonly verb: string; readonly icon: IconName; readonly act: () => Promise<void> }> = {
			delete: { verb: "Delete", icon: "delete", act: () => actions.remove() },
			wontdo: { verb: "Won’t do", icon: "wontdo", act: () => actions.setStatus("cancelled") },
			stop: { verb: "Stop", icon: "stop", act: () => actions.stop() },
		};
		const { verb, icon, act } = questions[what];
		const confirm = this.pick(act);
		this.confirmAsked = confirm;
		askGroup(this.panel, {
			verb,
			title: item.title,
			confirm: verb,
			icon,
			danger: what === "delete",
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
		const { actions } = this.context;
		sectionChooser(this.panel, {
			choice: sections,
			checked: (name) => name === sections.current,
			onBack: () => this.showMenu(),
			onPick: (name) => this.pick(() => actions.toSection(name))(),
			onNew: this.pick(() => actions.newSection()),
		});
		this.place();
	}

	/**
	 * The repeat panel in place of the menu, as Pick a date's: a change shows on the page at once and is written once as
	 * the menu closes; Remove repeat, for a task that repeats, is a pick that takes the rule off and closes.
	 */
	private showRepeat(): void {
		this.askFor(null, false);
		clear(this.panel);
		clear(this.upper);
		const { item, actions, today } = this.context;
		const remove = this.pick(() => actions.setRepeat(null));
		repeatPanel(this.panel, {
			rule: item.repeat,
			day: item.dueDate ?? today,
			onChange: (rule) => {
				this.repeatDraft = rule;
				this.place();
			},
			onRemove: item.repeat
				? () => {
						this.repeatDraft = null;
						remove();
					}
				: null,
		});
		this.place();
	}

	/** The repeat page's rule, unless it came back to the one the task had. */
	private writeRepeat(): void {
		const draft = this.repeatDraft;
		this.repeatDraft = null;
		if (draft && !sameRule(draft, this.context.item.repeat)) void this.context.actions.setRepeat(draft);
	}

	private showPicker(): void {
		this.askFor(null, false);
		clear(this.panel);
		clear(this.upper);
		const { item, actions, today } = this.context;
		datePage(this.panel, {
			today,
			selected: item.dueDate,
			onPick: (date) => this.pick(() => actions.postpone(date))(),
			onRemove: item.can.removeDue ? this.pick(() => actions.removeDue()) : undefined,
		});
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
		this.writeRepeat();
		this.fieldClosed?.(how);
	}
}
