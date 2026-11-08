import { type GroupName, type LabelLevel, labelTitle, type MenuEditId, type MenuGroupId, type MenuStatus, type MenuStatusId, type PriorityLevel, type ReminderKind, repeatParts, RepeatPage, type RepeatRule, type TaskItem, type TaskMenuModel, type Weekday } from "../../../core/application/contracts";
import { LAYOUT } from "../design";
import { clear, el, pinTo, px } from "../dom";
import { fillCard, markColours, renderTaskCard, renderUnwrittenCard, showMeta, showProgressDot } from "../TaskCard";
import { linkAt, type TaskLink } from "../TaskTitle";
import { showWhole } from "../wholeCard";
import type { LocalDate } from "../types";
import type { CloseHow } from "./Overlay";
import { LiftedMenu } from "./LiftedMenu";
import { moveTiles } from "./quickMoves";
import { askGroup, backRow, menuGroup, type MenuRowSpec, menuRow, type MenuTileSpec, tileGroup, tileRows } from "./MenuPanel";
import type { IconName } from "../kit/icons";
import { datePage } from "./DatePage";
import { projectChooser, sectionChooser } from "./SectionChooser";
import type { MarkdownSurface } from "../markdown/MarkdownSurface";
import { DescriptionPeek } from "./DescriptionPeek";
import { PanelPages } from "./PanelPages";
import { Motion } from "../motion/Motion";
import { repeatPanel } from "../repeat/RepeatPanel";
import { repeatValue } from "../repeat/repeatLabel";

export type EditRowId = MenuEditId;
/** What the menu asks about: a status tile that asks first, or Delete. */
export type Asking = MenuStatusId | "delete";

export interface StatusTile extends MenuStatus {
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

const STATUS_LOOKS: Readonly<Record<MenuStatusId, { readonly label: string; readonly icon: IconName }>> = {
	done: { label: "Done", icon: "done" },
	inProgress: { label: "In progress", icon: "progress" },
	stopProgress: { label: "Stop progress", icon: "progress" },
	wontDo: { label: "Won’t do", icon: "wontdo" },
	stop: { label: "Stop", icon: "stop" },
};

/** The status group's tiles as the menu's model has them, named and drawn. */
export function statusTiles(model: TaskMenuModel): readonly StatusTile[] {
	return model.statuses.map((status) => ({ ...status, ...STATUS_LOOKS[status.id] }));
}

/** How a question looks: its verb, its button's icon, and whether it is the danger of Delete. */
export function askLooks(what: Asking): { readonly verb: string; readonly icon: IconName; readonly danger: boolean } {
	if (what === "delete") return { verb: "Delete", icon: "delete", danger: true };
	const { label, icon } = STATUS_LOOKS[what];
	return { verb: label, icon, danger: false };
}

function repeatRow(rule: RepeatRule | null): EditRow {
	return { id: "repeat", label: "Repeat", value: rule === null ? "" : (repeatValue(rule) ?? ""), days: rule && repeatParts(rule).days, icon: "repeat" };
}

const REMINDER_NAMES: Readonly<Record<ReminderKind, string>> = { notification: "Notification", alarm: "Alarm", live: "Live Activity", none: "Off" };

/** The edit group's rows as the menu's model has them: the reminder's kind, the rule and the section's name beside theirs. */
export function editRows(item: TaskItem, model: TaskMenuModel): readonly EditRow[] {
	const rows: Readonly<Record<EditRowId, () => EditRow>> = {
		rename: () => ({ id: "rename", label: "Rename", value: "", icon: "rename" }),
		reminder: () => ({ id: "reminder", label: "Reminder", value: REMINDER_NAMES[item.reminder], icon: "reminder" }),
		description: () => ({ id: "description", label: "Add description", value: "", icon: "description" }),
		repeat: () => repeatRow(item.repeat),
		section: () => ({ id: "section", label: "Section", value: model.sections?.choice.current ?? "", icon: "section" }),
		subtask: () => ({ id: "subtask", label: "Add subtask", value: "", icon: "subtask" }),
	};
	return model.edits.map((id) => rows[id]());
}

/** The Project row: the project the tasks share, No project for none, nothing when they differ; disabled for subtasks, showing their parent's. */
export interface ProjectRow {
	readonly label: string;
	readonly value: string;
	readonly icon: IconName;
	readonly disabled: boolean;
}

export function projectRow(model: TaskMenuModel): ProjectRow {
	const { value, disabled } = model.project;
	return { label: "Project", value, icon: "project", disabled };
}

/** Where the Project row stands among the edit rows: right after Section, or where Section would stand, before Add subtask. */
export function projectRowAt(rows: readonly EditRow[]): number {
	const section = rows.findIndex((row) => row.id === "section");
	if (section >= 0) return section + 1;
	const subtask = rows.findIndex((row) => row.id === "subtask");
	return subtask >= 0 ? subtask : rows.length;
}

export interface LevelTile extends PriorityLevel {
	readonly on: boolean;
}

/** The priority group's tiles as the menu's model has them. */
export function priorityTiles(model: TaskMenuModel): readonly LevelTile[] {
	return model.levels.tiles.map(({ level, on }) => ({ prefix: level.prefix, color: level.color, on }));
}

export interface LabelTile extends LabelLevel {
	readonly title: string;
	readonly on: boolean;
}

/** The label group's tiles as the menu's model has them, named with spaces. */
export function labelTiles(model: TaskMenuModel): readonly LabelTile[] {
	return model.labels.tiles.map(({ label, on }) => ({ name: label.name, color: label.color, title: labelTitle(label.name), on }));
}

export interface MenuActions {
	/** A status tile (`TaskService.pickStatus`). */
	pickStatus(id: MenuStatusId): Promise<void>;
	/** Puts the task off to `date`: due that day, no slot, at the end of Now for today, of Soon for a later day. */
	postpone(date: LocalDate): Promise<void>;
	removeDue(): Promise<void>;
	/** To the end of that section of its list; null: among the tasks outside any. */
	toSection(name: GroupName): Promise<void>;
	/** The task waits at the end of its list under a field for the new section's name. */
	newSection(): void;
	/** The task's project: a note's link (`ProjectRef.link`), null for No project. */
	setProject(project: string | null): Promise<void>;
	/** A tap on a level (`TaskService.togglePriority`). */
	togglePriority(prefix: string): Promise<void>;
	/** A tap on a label (`TaskService.toggleLabel`); the task as it then stands, null once it is gone. */
	toggleLabel(name: string): Promise<TaskItem | null>;
	setReminder(kind: ReminderKind): Promise<void>;
	/** The task repeats by `rule` from now on; null: it repeats no more. */
	setRepeat(rule: RepeatRule | null): Promise<void>;
	/** The menu of a card in a calendar menu's stack stays open for it, its card may become the field (`openRename`); any other has closed. */
	rename(menu: TaskMenu): void;
	/** The task on the whole screen: to read its description, or with the caret straight in it. */
	openDescription(editing: boolean): void;
	/** The task on the whole screen; none where it already is. */
	openFull?(): void;
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
	/** The menu's groups for the task as it stands (`TaskService.menu`): asked again once a label changed it. */
	readonly menu: (item: TaskItem) => TaskMenuModel;
	readonly actions: MenuActions;
	/** Dresses the copy over the blur: a selected timeline card gives its copy the dots that stretch it. */
	readonly lifted?: (copy: HTMLElement, close: () => void) => void;
	/** A timeline card's subtasks stand between its copy and the panel; a tap on one opens its own menu instead. */
	readonly onSubtask?: (subtask: TaskItem, card: HTMLElement) => void;
	/** Draws the start of the task's description over its copy; without it the menu shows none. */
	readonly markdown?: MarkdownSurface;
	/** Opened by a finger still held on the card: its column stays still under it. */
	readonly held?: boolean;
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
	/** The panel's pages: a change of page grows or shrinks it in place, and each keeps its scroll. */
	private readonly pages = new PanelPages(() => [this.panel, this.upper]);
	/** What the menu asks about now, if anything; Enter confirms it, as its button does. */
	private asking: Asking | null = null;
	/** The repeat page shown, which writes what it holds as the menu closes. */
	private repeatPage: RepeatPage | null = null;
	private confirmAsked: (() => void) | null = null;
	/** The window the menu opened in: Enter confirms a question there. */
	private readonly keysDoc = activeDocument;
	private readonly onEnter = (e: KeyboardEvent) => {
		if (e.key !== "Enter" || !this.confirmAsked) return;
		e.preventDefault();
		e.stopPropagation();
		this.confirmAsked();
	};

	static open(context: TaskMenuContext): TaskMenu {
		return new TaskMenu(context);
	}

	/** A label being written: taps on the labels wait for it, the next one reads the task as it then stands. */
	private labelling = false;

	private constructor(private context: TaskMenuContext) {
		super(context.source);
		this.openOver(context.source, () => this.build(), context.held !== true);
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
		if (this.stackRow) return this.stackRow;
		const row = (this.stackRow = el(stack, "div", "tc-quick-row"));
		/** The field is put in the row once this returns: the row grows in with it, in the same task. */
		queueMicrotask(() => Motion.enter(row));
		return row;
	}

	/** Typing in the menu: the panel and the start of the description go, the field and its bar take their place. */
	private giveToField(): void {
		this.overlay.retire(this.panel);
		this.overlay.retire(this.upper);
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
		return DescriptionPeek.open(this.overlay, this.picks, markdown ?? null, item.description, {
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
		this.pages.show("menu", () => {
			clear(this.panel);
			clear(this.upper);
			this.panel.classList.remove("is-picker", "is-repeat", "has-remove");
			const { item, actions } = this.context;
			const model = this.context.menu(item);
			const edits: Record<EditRowId, () => void> = {
				rename: this.inStack ? () => actions.rename(this) : this.pickNow(() => actions.rename(this)),
				reminder: () => this.showReminders(),
				description: this.pickNow(() => actions.openDescription(true)),
				repeat: () => this.showRepeat(),
				section: () => this.showSections(),
				subtask: this.stacks ? () => actions.addSubtask(this) : this.pickNow(() => actions.addSubtask(this)),
			};
			const draw: Record<MenuGroupId, () => void> = {
				statuses: () => {
					const tiles = statusTiles(model);
					const asked = this.asking;
					if (asked !== null && asked !== "delete") this.askGroup(asked);
					else tileGroup(this.panel, tiles.length > 3 ? "is-status is-four" : "is-status", [tiles.map((tile): MenuTileSpec => ({ label: tile.label, icon: tile.icon, onPick: tile.confirm ? () => this.askFor(tile.id) : this.pick(() => actions.pickStatus(tile.id)) }))]);
				},
				levels: () => {
					const levelTiles = priorityTiles(model).map((tile): MenuTileSpec => ({ label: tile.prefix, icon: "priority", color: tile.color, on: tile.on, disabled: model.levels.disabled, onPick: this.pick(() => actions.togglePriority(tile.prefix)) }));
					if (levelTiles.length > 0) tileGroup(this.panel, "is-priority", tileRows(levelTiles));
				},
				labels: () => {
					const tagTiles = labelTiles(model).map((tile): MenuTileSpec => ({ label: tile.title, icon: "label", color: tile.color, on: tile.on, disabled: model.labels.disabled, onPick: () => void this.toggleLabel(tile.name) }));
					if (tagTiles.length > 0) tileGroup(this.panel, "is-labels", tileRows(tagTiles));
				},
				moves: () => {
					const moves = moveTiles(model.moves).map(({ label, icon, date }): MenuTileSpec => ({
						label,
						icon,
						onPick: date === null ? () => this.showPicker() : this.pick(() => actions.postpone(date)),
					}));
					if (moves.length > 0) tileGroup(this.panel, "is-move", [moves]);
				},
				edits: () => {
					const rows = editRows(item, model);
					const specs = rows.map((row): MenuRowSpec => ({ label: row.label, value: row.value, days: row.days, icon: row.icon, onPick: edits[row.id] }));
					const project = projectRow(model);
					specs.splice(projectRowAt(rows), 0, { ...project, onPick: () => this.showProjects() });
					menuGroup(this.panel, specs);
				},
				opens: () => {
					const openFull = actions.openFull;
					menuGroup(this.panel, [
						...(openFull ? [{ label: "Open full screen", icon: "fullScreen", onPick: this.pick(() => openFull()) } as const] : []),
						{ label: "Open in Obsidian", icon: "openFile", onPick: this.pick(() => actions.openInObsidian()) },
					]);
				},
				remove: () => {
					const remove = model.remove;
					if (this.asking === "delete") this.askGroup("delete");
					else if (remove) menuRow(this.panel, { label: "Delete", icon: "delete", danger: true, apart: true, onPick: remove.confirm ? () => this.askFor("delete") : this.pick(() => actions.remove()) });
				},
			};
			for (const group of model.groups) draw[group]();
			this.place(keepAbove);
			this.panel.querySelector(".tc-menu-ask")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
		});
	}

	/**
	 * A label goes on or off and the menu stays, for the next one: it is drawn again for the task as the file now has it,
	 * the copy over the blur in the task's new colours. Closed meanwhile, or the task gone, it stays closed.
	 */
	private async toggleLabel(name: string): Promise<void> {
		if (this.labelling) return;
		this.labelling = true;
		try {
			const next = await this.context.actions.toggleLabel(name);
			if (this.isClosed) return;
			if (!next) return this.close();
			this.context = { ...this.context, item: next };
			const card = this.lifted.classList.contains("is-block") ? this.lifted.querySelector<HTMLElement>(".tc-block-card") : this.lifted;
			if (card) markColours(card, next);
			this.showMenu(this.groupsAbove());
		} finally {
			this.labelling = false;
		}
	}

	/** What the model says asks first (Delete, Won’t do, Stop) asks in place of what was pressed; the rest of the menu stays as it is. */
	private askFor(what: Asking | null, show = true): void {
		this.asking = what;
		this.confirmAsked = null;
		if (what === null) this.keysDoc.removeEventListener("keydown", this.onEnter, true);
		else this.keysDoc.addEventListener("keydown", this.onEnter, true);
		if (show) this.showMenu(this.groupsAbove());
	}

	/** How many of the panel's groups stand over the card now: a question takes the place of a group and moves none. */
	private groupsAbove(): number {
		if (this.panel.classList.contains("is-above")) return this.panel.children.length;
		return this.upper.hidden ? 0 : this.upper.children.length;
	}

	private askGroup(what: Asking): void {
		const { item, actions } = this.context;
		const { verb, icon, danger } = askLooks(what);
		const confirm = this.pick(() => (what === "delete" ? actions.remove() : actions.pickStatus(what)));
		this.confirmAsked = confirm;
		askGroup(this.panel, {
			verb,
			title: item.title,
			confirm: verb,
			icon,
			danger,
			onCancel: () => this.askFor(null),
			onConfirm: confirm,
		});
	}

	/** The sections of the task's list, its own checked, then the tasks outside any; New section asks for a name. */
	private showSections(): void {
		const sections = this.context.menu(this.context.item).sections;
		if (!sections) return;
		this.pages.show("sections", () => {
			this.askFor(null, false);
			clear(this.panel);
			clear(this.upper);
			const { actions } = this.context;
			sectionChooser(this.panel, {
				sections,
				onBack: () => this.showMenu(),
				onPick: (name) => this.pick(() => actions.toSection(name))(),
				onNew: this.pickNow(() => actions.newSection()),
			});
			this.place();
		});
	}

	/** The Project page in place of the menu, as Section's: the project notes by name, No project last, the current one checked. */
	private showProjects(): void {
		this.pages.show("projects", () => {
			this.askFor(null, false);
			clear(this.panel);
			clear(this.upper);
			const { item, actions } = this.context;
			projectChooser(this.panel, {
				project: this.context.menu(item).project,
				onBack: () => this.showMenu(),
				onPick: (link) => this.pick(() => actions.setProject(link))(),
			});
			this.place();
		});
	}

	/** The Reminder submenu in place of the menu: the way back, the kinds, the task's own checked, Off last; a pick sets it and closes. */
	private showReminders(): void {
		this.pages.show("reminders", () => {
			this.askFor(null, false);
			clear(this.panel);
			clear(this.upper);
			const { item, actions } = this.context;
			backRow(this.panel, "Reminder", () => this.showMenu());
			const group = menuGroup(this.panel, []);
			for (const { kind, checked } of this.context.menu(item).reminders)
				menuRow(group, { label: REMINDER_NAMES[kind], icon: checked ? "check" : undefined, choice: true, quiet: kind === "none", onPick: this.pick(() => actions.setReminder(kind)) });
			this.place();
		});
	}

	/**
	 * The repeat panel in place of the menu, as Pick a date's: a change shows on the page at once and is written once as
	 * the menu closes; Remove repeat, for a task that repeats, is a pick that takes the rule off and closes.
	 */
	private showRepeat(): void {
		this.pages.show("repeat", () => {
			this.askFor(null, false);
			clear(this.panel);
			clear(this.upper);
			const { item, actions } = this.context;
			const page = (this.repeatPage ??= new RepeatPage(item, (rule) => void actions.setRepeat(rule)));
			const close = this.pick(() => undefined);
			repeatPanel(this.panel, {
				draft: page.draft,
				onChange: (rule) => {
					page.change(rule);
					this.pages.show("repeat", () => this.place());
				},
				onRemove: () => {
					page.remove();
					close();
				},
			});
			this.place();
		});
	}

	private showPicker(): void {
		this.pages.show("picker", () => {
			this.askFor(null, false);
			clear(this.panel);
			clear(this.upper);
			const { item, actions, today } = this.context;
			const model = this.context.menu(item);
			datePage(this.panel, {
				today,
				selected: model.dueDate,
				onPick: (date) => this.pick(() => actions.postpone(date))(),
				onRemove: model.removeDue ? this.pick(() => actions.removeDue()) : undefined,
			});
			this.place();
		});
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
		const win = activeWindow;
		const press = (e: PointerEvent) => {
			win.removeEventListener("pointerdown", press, true);
			if (performance.now() > until) return;
			stop(e);
			win.addEventListener("click", stop, { capture: true, once: true });
			this.close();
			then();
		};
		win.addEventListener("pointerdown", press, true);
	}

	protected override closed(how: CloseHow): void {
		this.keysDoc.removeEventListener("keydown", this.onEnter, true);
		this.repeatPage?.close();
		this.fieldClosed?.(how);
	}
}
