import type { NewTaskPlace, Placement, TaskItem, TaskKey, TaskService } from "../../application/contracts";
import { type PriorityLevel, type RightMode, usableLevels } from "../../settings";
import { modeShowing, type SwitchColumn } from "../ColumnSwitch";
import { type DayColumn, dayColumn } from "../dayColumn";
import { DESIGN, LAYOUT } from "../design";
import type { DragController } from "../drag/DragController";
import type { DropTarget, ListColumn, PlacedResult } from "../drag/DropTarget";
import { gapOf, type ListCard, type PlaceResult, sameTask } from "../drag/listPlace";
import type { GestureArbiter } from "../gestures";
import type { CloseHow } from "../menu/Overlay";
import type { TaskMenu } from "../menu/TaskMenu";
import type { ListEntryInput, TaskList } from "../TaskList";
import type { Timeline } from "../Timeline";
import type { LocalDate, Slot } from "../types";
import { PlusButton } from "./PlusButton";
import { PlusRing } from "./PlusRing";
import { QuickBar, type QuickBarState } from "./QuickBar";
import { type EntrySpot, type EntryState, QuickEntry } from "./QuickEntry";
import { levelOfText, QuickField, type QuickFieldHandle, type QuickKey } from "./QuickField";
import type { TitleFieldFactory } from "./TitleField";

/** A list as a place to drop, and the column it is. */
export type ColumnDrop = DropTarget & { readonly column: ListColumn };

export interface QuickEntryControllerDeps {
	/** The view's content: the plus and the bar go in it, the bar last, at its bottom. */
	readonly root: HTMLElement;
	readonly tasks: Pick<TaskService, "createInPlace" | "edit" | "placementOf">;
	readonly arbiter: GestureArbiter;
	readonly drag: Pick<DragController, "beginNew">;
	/** The field the text is typed in. */
	readonly titleField: TitleFieldFactory;
	list(column: ListColumn): TaskList | null;
	timeline(): Timeline | null;
	/** A task of the timeline as the screen shows it now; null once it is not there. */
	task(key: TaskKey): TaskItem | null;
	/** The New task buttons under the lists. */
	newTasks(): readonly { shown: boolean }[];
	/** Where the plus may be carried: the lists the window shows, and the timeline while it shows. */
	dropTargets(): { readonly lists: readonly ColumnDrop[]; readonly timeline: DropTarget | null };
	levels(): readonly PriorityLevel[];
	today(): LocalDate;
	/** The day the day column shows. */
	day(): LocalDate;
	mode(): RightMode;
	/** Turns the wheel to `mode`, as a tap on its icon does. */
	turnTo(mode: RightMode): void;
	/** The day column opens `date`; resolves once its tasks show. */
	showDay(date: LocalDate): Promise<void>;
	/** Resolves once the lists show the file as of the last write. */
	fresh(): Promise<void>;
	/** Redraws the screen, which calls `rendered` once drawn. */
	render(): void;
	/** A write that failed. */
	onError(error: unknown): void;
}

/**
 * A field in a calendar menu: last in its stack, a new subtask of `parent`; or in place of a card of the stack, which it
 * renames (no parent).
 */
interface MenuField {
	readonly menu: TaskMenu;
	readonly row: HTMLElement;
	readonly parent: TaskItem | null;
}

/** What closes the field when tapped: anything but the field and what its editor shows, the bar with its panels, and the plus. */
const KEEPS_FIELD = ".tc-quick-row, .tc-quick-bar, .tc-plus";

const SWITCH_COLUMN: Readonly<Record<ListColumn, SwitchColumn>> = { inbox: "inbox", soon: "soon", left: "now" };

/** The columns to look for a task in: those the window shows first. */
const LOOK_IN: Readonly<Record<RightMode, readonly ListColumn[]>> = {
	calendar: ["left", "soon", "inbox"],
	soon: ["soon", "left", "inbox"],
	inbox: ["inbox", "soon", "left"],
};

/** What a drop of the plus on a list means for the file; null for a drop elsewhere. */
function placeResultOf(result: PlacedResult): PlaceResult | null {
	switch (result.kind) {
		case "listBefore":
			return { kind: "task", group: null, before: result.before };
		case "group":
			return { kind: "task", group: result.group, before: result.before };
		case "nest":
			return { kind: "subtask", parent: result.parent, before: result.before };
		default:
			return null;
	}
}

/** The list redraws when the field moves or the texts waiting before it change; typing only changes the field. */
function movesRows(before: EntryState | null, after: EntryState): boolean {
	if (!before || before.spot !== after.spot || before.renaming !== after.renaming) return true;
	return before.pending.length !== after.pending.length || before.pending.some((line, i) => line.text !== after.pending[i].text || line.level !== after.pending[i].level);
}

/**
 * Typing tasks in place (quick-add spec §4.2–4.9): opens the entry from New task, the plus, a long tap on the timeline,
 * the task menu; draws the field in its list, in its slot or over its card on the timeline, or last in a calendar menu's
 * stack of subtasks, and keeps it focused across redraws, 16 px over the bar; shows the bar and hides the plus while the
 * entry is open. What the entry means for the file is QuickEntry's.
 */
export class QuickEntryController {
	private readonly entry: QuickEntry;
	private readonly bar: QuickBar;
	private readonly plus: PlusButton;
	private readonly ring: PlusRing;
	private state: EntryState | null = null;
	private field: QuickFieldHandle | null = null;
	/** The field took the focus with its own selection; after that a redraw only gives it back. */
	private focused = false;
	/** A rename's place was chosen in the bar: the task goes where the field now stands. */
	private moved = false;
	private dragging = false;
	private carrying = false;
	private droppedOn: ListColumn | null = null;
	/** The bar's place is turning the wheel to the column the field has just moved to. */
	private turning = false;
	private stack: MenuField | null = null;
	/**
	 * The field opened as a press ended: the click that press still sends is not a tap elsewhere, nor are the mouse events
	 * a finger's tap sends after it, which land on what stood under the plus and would take the focus from the field.
	 */
	private pressEnding = false;
	private readonly pressed = () => (this.pressEnding = false);
	private readonly mousePressed = (e: MouseEvent) => {
		if (this.pressEnding && this.state) e.preventDefault();
	};
	/** The field opened, moved or changed: its list follows it into sight until the finger scrolls the list away. */
	private follow = false;
	/** Where the last reveal left each scroller: a scroll to anywhere else is the finger's. */
	private readonly revealedAt = new WeakMap<Element, number>();
	private readonly scrolled = (e: Event) => {
		const scroller = this.state ? this.scrollerOf(this.state.spot) : null;
		if (!scroller || e.target !== scroller) return;
		const at = this.revealedAt.get(scroller);
		if (at === undefined || Math.abs(scroller.scrollTop - at) >= 1) this.follow = false;
	};
	private readonly tapAway = (e: Event) => {
		if (!this.state || this.pressEnding || (e.target instanceof Element && (e.target.closest(KEEPS_FIELD) || this.field?.owns(e.target)))) return;
		this.entry.blur();
	};

	constructor(private readonly deps: QuickEntryControllerDeps) {
		this.entry = new QuickEntry({
			cards: (column) => this.cards(column),
			placeOf: (column, result) => this.placeOf(column, result),
			fresh: () => deps.fresh(),
			createInPlace: (text, priority, place) => deps.tasks.createInPlace(text, priority, place),
			edit: (key, draft) => deps.tasks.edit(key, draft),
			placement: (spot) => this.placement(spot),
			levels: () => usableLevels(deps.levels()),
			onChange: (state) => this.changed(state),
			onError: (error) => deps.onError(error),
		});
		this.plus = new PlusButton(deps.root, { onTap: () => this.openFromPress(), onDrag: (e, source) => this.dragFromPlus(e, source), arbiter: deps.arbiter });
		this.ring = new PlusRing(deps.root);
		this.bar = new QuickBar(deps.root, {
			levels: () => deps.levels(),
			today: () => deps.today(),
			onIndent: (delta) => this.entry.indent(delta),
			onPriority: (prefix) => this.choosePriority(prefix),
			onPlace: (placement) => void this.moveTo(placement),
		});
		document.addEventListener("click", this.tapAway, true);
		document.addEventListener("pointerdown", this.pressed, true);
		document.addEventListener("mousedown", this.mousePressed, true);
		deps.root.addEventListener("scroll", this.scrolled, true);
	}

	/** New task, or a double click on a list's free room: the field at the end of the column. */
	openAtEnd(column: ListColumn): void {
		this.open(this.endOf(column));
	}

	/** The end of the day column while it shows, of Inbox when the window shows Inbox and Soon. */
	openFromPlus(): void {
		this.openAtEnd(this.deps.mode() === "inbox" ? "inbox" : "left");
	}

	/** The plus tapped: the field opens as the press ends, and what that press still sends is not a tap elsewhere. */
	private openFromPress(): void {
		this.pressEnding = true;
		this.openFromPlus();
	}

	/** The plus taken: carried as a task is, and let go on a list, the field opens where the drop showed. */
	dragFromPlus(e: PointerEvent, source: HTMLElement): void {
		const { lists, timeline } = this.deps.dropTargets();
		this.droppedOn = null;
		const targets = [this.ring, ...lists.map((target) => this.noted(target)), ...(timeline ? [timeline] : [])];
		if (!this.deps.drag.beginNew(source, e, targets, (result) => this.dropped(result))) return;
		this.carrying = true;
		this.ring.show();
		this.showPlus();
	}

	/** A long tap on the timeline's free room let go: the field of a new task in the slot it showed. */
	openSlot(slot: Slot): void {
		this.pressEnding = true;
		this.open({ kind: "slot", slot });
	}

	/**
	 * The field as the last subtask of `parent`: in the list that shows it; for a task only on the calendar, last in the
	 * stack of its calendar menu, which stays open for it. Any other menu closes.
	 */
	addSubtask(parent: TaskItem, menu?: TaskMenu): void {
		const found = this.find(parent.key);
		if (found || !menu?.stacks) menu?.close();
		if (found) this.open({ kind: "list", column: found.column, place: gapOf(this.cards(found.column), { kind: "subtask", parent: parent.key, before: null }) });
		else if (menu?.stacks) this.openStack(parent, menu);
	}

	/**
	 * The card becomes the field, with its text: in a list the field stands right before the card, which hides; a subtask
	 * tapped in a calendar menu's stack is renamed in its card there, the menu kept open for it; a task only on the
	 * calendar is renamed in its card on the timeline, where it keeps its place. Any other menu closes.
	 */
	rename(item: TaskItem, menu?: TaskMenu): void {
		const found = this.find(item.key);
		const inMenu = !found && !!menu?.inStack;
		if (!inMenu) menu?.close();
		if (menu && inMenu) this.renameInMenu(item, menu);
		else if (!found && item.slot) this.open({ kind: "slot", slot: item.slot }, item);
		if (!found) return;
		const card = this.cards(found.column)[found.index];
		this.open({ kind: "list", column: found.column, place: { kind: "gap", index: found.index, level: card.level, group: card.group } }, item);
	}

	/**
	 * Before the screen shows another day or another pair of columns: the open field is finished as by a tap elsewhere,
	 * and this resolves once every text typed is written for the day and the place it was typed at, which the switch
	 * would otherwise change under the writes. The wheel the bar's place turns keeps the field it has just moved.
	 */
	async settle(): Promise<void> {
		if (!this.turning) this.entry.blur();
		await this.entry.idle();
	}

	/** What `column`'s list draws for the entry: none when the field stands elsewhere. */
	entryIn(column: ListColumn): ListEntryInput | null {
		const state = this.state;
		if (state?.spot.kind !== "list" || state.spot.column !== column) return null;
		return { place: state.spot.place, pending: state.pending, field: (row) => this.fieldIn(row) };
	}

	/** The task being renamed, whose card every list hides while the rename is open, wherever the field stands (§4.8). */
	renaming(): TaskKey | null {
		return this.state?.renaming?.key ?? null;
	}

	/** A card is lifted or settled: the plus hides while it is carried. */
	onDragging(active: boolean): void {
		this.dragging = active;
		this.showPlus();
	}

	/**
	 * The screen was drawn: New task for the window's place, the plus, and the field focused and in sight. The cards may
	 * have changed under the field, a written line landing, so what the field may do is read again.
	 */
	rendered(): void {
		if (this.state) this.state = this.entry.state;
		const shown = this.deps.mode() !== "calendar";
		for (const button of this.deps.newTasks()) button.shown = shown;
		this.deps.root.classList.toggle("is-entering", this.state !== null);
		this.showPlus();
		this.placeOffLists(this.state);
		if (!this.state) {
			this.bar.hide();
			return;
		}
		this.sync(this.state);
		const field = this.field;
		if (!field?.el.isConnected) return;
		if (!this.focused) {
			this.focused = true;
			field.focus();
		} else if (!field.focused) field.refocus();
		this.reveal();
	}

	/**
	 * After a redraw, and as the keyboard shrinks the view, which the bar over a menu follows: while the field is followed,
	 * the list or the timeline scrolls it into sight, at least 16 px over the bar, and a menu raises the parts over its blur
	 * as far as that needs. A list the finger scrolled away stays where it was left.
	 */
	reveal(): void {
		const state = this.state;
		if (state) this.liftBar(state);
		if (state && this.follow) this.bringIntoSight(state);
	}

	/** The view closes: the text typed is kept, as by a tap elsewhere. */
	close(): void {
		document.removeEventListener("click", this.tapAway, true);
		document.removeEventListener("pointerdown", this.pressed, true);
		document.removeEventListener("mousedown", this.mousePressed, true);
		this.deps.root.removeEventListener("scroll", this.scrolled, true);
		this.entry.blur();
		this.bar.hide();
	}

	/** Where a task written in `column` goes, for the day the column shows: Now for today or a past day, Soon for a later one. */
	placeOf(column: ListColumn, result: PlaceResult): NewTaskPlace {
		if (result.kind === "subtask") return { kind: "subtask", parent: result.parent, before: result.before };
		const { group, before } = result;
		if (column !== "left") return { kind: "list", list: column, group, before };
		const { list, date } = this.shownDay();
		return date === null ? { kind: "list", list, group, before } : { kind: "list", list, group, before, date };
	}

	private open(spot: EntrySpot, renaming?: TaskItem): void {
		this.dropField();
		this.entry.open(spot, renaming);
	}

	/** After the last card, in the last section, at the top level. */
	private endOf(column: ListColumn): EntrySpot {
		const list = this.deps.list(column);
		const groups = list?.groups ?? [];
		return { kind: "list", column, place: { kind: "gap", index: list?.cards.length ?? 0, level: 0, group: groups[groups.length - 1]?.name ?? null } };
	}

	private cards(column: ListColumn): readonly ListCard[] {
		return this.deps.list(column)?.listCards ?? [];
	}

	/** What the day column stands for on the day it shows. */
	private shownDay(): DayColumn {
		return dayColumn(this.deps.day(), this.deps.today());
	}

	private find(key: TaskKey): { readonly column: ListColumn; readonly index: number } | null {
		for (const column of LOOK_IN[this.deps.mode()]) {
			const index = this.cards(column).findIndex((card) => sameTask(card.key, key));
			if (index >= 0) return { column, index };
		}
		return null;
	}

	/** A list the plus is carried over, which notes that it took the drop: the result alone does not say which list it was. */
	private noted(target: ColumnDrop): DropTarget {
		return {
			hitTest: (x, y, drag) => target.hitTest(x, y, drag),
			preview: (x, y, drag) => target.preview(x, y, drag),
			landing: () => target.landing(),
			clear: () => target.clear(),
			drop: (x, y, drag) => {
				this.droppedOn = target.column;
				return target.drop(x, y, drag);
			},
		};
	}

	/** The plus came to rest: the field opens where it landed, in a list or in a slot of the timeline. */
	private dropped(result: PlacedResult | null): void {
		this.carrying = false;
		this.ring.hide();
		const column = this.droppedOn;
		const place = result && column ? placeResultOf(result) : null;
		if (column && place) this.open({ kind: "list", column, place: gapOf(this.cards(column), place) });
		else if (result?.kind === "slot") this.open({ kind: "slot", slot: result.slot });
		else this.showPlus();
	}

	/** The menu stays over the screen, its panel gone, and the field stands last in its stack of subtasks. */
	private openStack(parent: TaskItem, menu: TaskMenu): void {
		this.stack = { menu, row: menu.openStack((how) => this.menuClosed(menu, how)), parent };
		this.open({ kind: "stack", parent: parent.key });
	}

	/** The card of the stack becomes the field, in a calendar menu kept open; the spot is the menu's, of the task itself, where nothing new is written. */
	private renameInMenu(item: TaskItem, menu: TaskMenu): void {
		this.stack = { menu, row: menu.openRename((how) => this.menuClosed(menu, how)), parent: null };
		this.open({ kind: "stack", parent: item.key }, item);
	}

	/** The menu closed by itself: Escape drops the field's text, a tap on the blur keeps it as a tap elsewhere does. */
	private menuClosed(menu: TaskMenu, how: CloseHow): void {
		if (this.stack?.menu !== menu) return;
		this.stack = null;
		if (how === "escape") this.entry.escape();
		else this.entry.blur();
	}

	/**
	 * The field off the lists: the timeline holds it in its slot or over the renamed card; a menu last in its stack under
	 * the subtasks as the screen shows them now and the texts not yet written, or in place of the card it renames. Each
	 * lets it go once it stands elsewhere.
	 */
	private placeOffLists(state: EntryState | null): void {
		const spot = state?.spot;
		const timeline = this.deps.timeline();
		if (spot?.kind === "slot" && state) {
			const field = this.offListField();
			if (state.renaming) timeline?.showRename(state.renaming, field);
			else timeline?.showField(spot.slot, field);
		} else timeline?.clearField();
		const stack = this.stack;
		if (spot?.kind === "stack" && state && stack) {
			if (stack.parent) stack.menu.showStack(this.deps.task(spot.parent) ?? stack.parent, state.pending.map((line) => line.text));
			const field = this.offListField();
			if (field.parentElement !== stack.row) stack.row.appendChild(field);
		} else if (stack) {
			this.stack = null;
			stack.menu.close();
		}
	}

	/** The field for a holder off the lists, made the first time it is asked for. */
	private offListField(): HTMLElement {
		return (this.field ??= this.openField(document.createElement("div"))).el;
	}

	/** What scrolls the field into sight: its list, or the timeline; a menu's stack does not scroll. */
	private scrollerOf(spot: EntrySpot): HTMLElement | null {
		if (spot.kind === "list") return this.deps.list(spot.column)?.el ?? null;
		if (spot.kind === "slot") return this.deps.timeline()?.el ?? null;
		return null;
	}

	/** The list or the timeline scrolls the field into sight, at least 16 px over the bar; a menu raises the parts over its blur. */
	private bringIntoSight(state: EntryState): void {
		const field = this.field?.el;
		if (!field?.isConnected) return;
		const rect = field.getBoundingClientRect();
		const limit = this.deps.root.getBoundingClientRect().bottom - DESIGN.barHeight - LAYOUT.fieldOverBar;
		const menu = state.spot.kind === "stack" ? this.stack?.menu : null;
		if (menu) {
			menu.raise(menu.raised + rect.bottom - limit);
			return;
		}
		const scroller = this.scrollerOf(state.spot);
		if (!scroller) return;
		const top = scroller.getBoundingClientRect().top;
		const by = rect.bottom > limit ? rect.bottom - limit : rect.top < top ? rect.top - top : 0;
		this.revealedAt.set(scroller, scroller.scrollTop + by);
		if (by !== 0) scroller.scrollTop += by;
		this.revealedAt.set(scroller, scroller.scrollTop);
	}

	/** Over a menu's blur the bar stands above it, at the bottom of the view. */
	private liftBar(state: EntryState): void {
		this.bar.lift(state.spot.kind === "stack" ? this.deps.root.getBoundingClientRect() : null);
	}

	private showPlus(): void {
		this.plus.hidden = this.state !== null || this.dragging || this.carrying;
	}

	private changed(state: EntryState | null): void {
		const before = this.state;
		this.state = state;
		if (state?.renaming !== before?.renaming) this.moved = false;
		if (!state) {
			this.dropField();
			this.bar.hide();
			this.placeOffLists(null);
		}
		const moves = !state || movesRows(before, state);
		if (state && moves) this.follow = true;
		if (moves) this.deps.render();
		else this.sync(state);
	}

	/** The field and the bar show the state: its text, its level, what the field may do. */
	private sync(state: EntryState): void {
		const level = this.levelOf(state);
		if (this.field && this.field.text !== state.text) this.field.setValue(state.text);
		this.field?.setPriority(level);
		this.bar.show(this.barState(state, level));
		this.liftBar(state);
	}

	private barState(state: EntryState, priority: PriorityLevel | null): QuickBarState {
		return { canIndent: state.canIndent, canOutdent: state.canOutdent, indents: state.spot.kind === "list", priority, place: this.shownPlace(state) };
	}

	/** The level chosen in the bar, else the one the text's prefix stands for. */
	private levelOf(state: EntryState): PriorityLevel | null {
		const levels = usableLevels(this.deps.levels());
		return levels.find((level) => level.prefix === state.priority) ?? levelOfText(state.text, levels);
	}

	/** A level chosen in the bar takes the place of a prefix typed: the text keeps no prefix, so the file gets one. */
	private choosePriority(prefix: string | null): void {
		const state = this.state;
		if (!state) return;
		const typed = levelOfText(state.text, usableLevels(this.deps.levels()));
		if (typed) this.entry.type(state.text.slice(typed.prefix.length + 1));
		this.entry.setPriority(prefix);
	}

	/** The place button: a subtask's field, new or renamed, has none, nor does one off the lists. */
	private shownPlace(state: EntryState): Placement | null {
		const { spot, renaming } = state;
		if (spot.kind !== "list") return null;
		if (renaming) return renaming.key.path.length > 0 ? null : this.placement(spot);
		return spot.place.level > 0 ? null : this.columnPlacement(spot.column);
	}

	/** Where a renamed task goes: where it was, until a place is chosen in the bar. */
	private placement(spot: EntrySpot): Placement {
		const item = this.state?.renaming ?? null;
		if (spot.kind === "list" && (this.moved || !item)) return this.columnPlacement(spot.column);
		return item ? this.deps.tasks.placementOf(item) : this.columnPlacement("left");
	}

	private columnPlacement(column: ListColumn): Placement {
		if (column !== "left") return { kind: column };
		const { date } = this.shownDay();
		return date === null ? { kind: "now" } : { kind: "date", date };
	}

	/**
	 * A place chosen in the bar: the field goes to the end of that column at once, still in the tap that keeps the
	 * keyboard up, and the wheel turns to show the column. Another day opens in the day column once what was typed is
	 * written, as it was written for the day shown; the field then goes to the end of that day's list.
	 */
	private async moveTo(placement: Placement): Promise<void> {
		const column: ListColumn = placement.kind === "inbox" || placement.kind === "soon" ? placement.kind : "left";
		const date = placement.kind === "now" ? this.deps.today() : placement.kind === "date" ? placement.date : null;
		this.moved = true;
		this.entry.moveTo(this.endOf(column));
		this.turning = true;
		try {
			this.deps.turnTo(modeShowing(SWITCH_COLUMN[column], this.deps.mode()));
		} finally {
			this.turning = false;
		}
		if (date === null || date === this.deps.day()) return;
		await this.entry.idle();
		await this.deps.showDay(date);
		this.entry.moveTo(this.endOf(column));
	}

	private fieldIn(row: HTMLElement): HTMLElement {
		const field = (this.field ??= this.openField(row));
		for (const child of [...row.children]) if (child !== field.el) child.remove();
		if (field.el.parentElement !== row) row.appendChild(field.el);
		return field.el;
	}

	private openField(row: HTMLElement): QuickFieldHandle {
		const state = this.state;
		const levels = usableLevels(this.deps.levels());
		const handle: QuickFieldHandle = QuickField.open(row, {
			value: state?.text ?? "",
			select: state?.renaming != null,
			levels,
			priority: state ? this.levelOf(state) : null,
			titleField: this.deps.titleField,
			onInput: (text) => {
				this.entry.type(text);
				this.follow = true;
				this.reveal();
			},
			onPriority: () => this.state && this.sync(this.state),
			onKey: (key) => this.key(key),
			onBlur: () => this.blurred(handle),
		});
		return handle;
	}

	/** The field goes with its editor; the next one is made where the entry stands then. */
	private dropField(): void {
		this.field?.destroy();
		this.field = null;
		this.focused = false;
	}

	private key(key: QuickKey): void {
		if (key === "enter") this.entry.enter();
		else if (key === "escape") this.entry.escape();
		else this.entry.indent(key === "tab" ? 1 : -1);
	}

	/**
	 * The field lost the focus: the keyboard was put away, or something else took it. A redraw that moves the field gives
	 * it back at once, and a window that loses the focus keeps it as the active element: neither ends the entry.
	 */
	private blurred(handle: QuickFieldHandle): void {
		window.setTimeout(() => {
			if (this.field === handle && this.state && !handle.focused) this.entry.blur();
		});
	}
}
