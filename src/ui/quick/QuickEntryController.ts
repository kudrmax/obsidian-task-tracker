import { gapOfPlace, type GroupName, type ListCard, type ListPlace, type NewTaskPlace, type Placement, type RightMode, samePlace, type TaskItem, type TaskKey, type TaskService, type DraftMarks } from "../../application/contracts";
import type { EntryPart } from "./EntryPart";
import { modeShowing, type SwitchColumn } from "../ColumnSwitch";
import { LAYOUT } from "../design";
import { FramePass } from "../FramePass";
import type { Glide } from "../Keyboard";
import type { DragController } from "../drag/DragController";
import type { DropTarget, ListColumn, DropResult } from "../drag/DropTarget";
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
import { QuickField, type QuickFieldHandle, type QuickKey } from "./QuickField";
import { ScrollGlide } from "./ScrollGlide";
import type { TitleFieldFactory } from "./TitleField";

/** A list as a place to drop, and the column it is. */
export type ColumnDrop = DropTarget & { readonly column: ListColumn };

export interface QuickEntryControllerDeps {
	/** The view's content: the plus and the bar go in it, the bar last, at its bottom. */
	readonly root: HTMLElement;
	readonly tasks: Pick<TaskService, "createInPlace" | "createSection" | "edit" | "placementOf" | "placementOfDay" | "listName" | "dayOfPlacement" | "priorityLevels" | "labelLevels" | "parseTitle" | "isBlank" | "withPriority" | "draftMarks">;
	readonly arbiter: GestureArbiter;
	readonly drag: Pick<DragController, "beginNew">;
	/** The field the text is typed in. */
	readonly titleField: TitleFieldFactory;
	list(column: ListColumn): TaskList | null;
	/** The column shows sections: the field may write one there. */
	sectioned(column: ListColumn): boolean;
	timeline(): Timeline | null;
	/** A task of the timeline as the screen shows it now; null once it is not there. */
	task(key: TaskKey): TaskItem | null;
	/** Where the plus may be carried: the lists the window shows, and the timeline while it shows. */
	dropTargets(): { readonly lists: readonly ColumnDrop[]; readonly timeline: DropTarget | null };
	today(): LocalDate;
	/** Obsidian runs on the desktop: the bar is a capsule by the field, not a bar over the keyboard. */
	desktop(): boolean;
	/** Where Obsidian's own chrome starts under the view: the top of its desktop status bar while it shows, else Infinity. */
	chromeTop(): number;
	/** The day the day column shows. */
	day(): LocalDate;
	mode(): RightMode;
	/** Turns the wheel to `mode`, as a tap on its icon does. */
	turnTo(mode: RightMode): void;
	/** The day column opens `date`; resolves once its tasks show. */
	showDay(date: LocalDate): Promise<void>;
	/** Resolves once the lists show the file as of the last write; `beforeShow` runs once their data is what was read, right before they draw it. */
	fresh(beforeShow?: () => void): Promise<void>;
	/** Redraws the lists and the timeline, which calls `rendered` once drawn. */
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


const SWITCH_COLUMN: Readonly<Record<ListColumn, SwitchColumn>> = { inbox: "inbox", backlog: "inbox", soon: "soon", left: "now" };

/** The columns to look for a task in: those the window shows first. */
const LOOK_IN: Readonly<Record<RightMode, readonly ListColumn[]>> = {
	calendar: ["left", "soon", "inbox", "backlog"],
	soon: ["soon", "left", "inbox", "backlog"],
	inbox: ["inbox", "backlog", "soon", "left"],
};

/** What a drop of the plus on a list means for the file; null for a drop elsewhere. */
function placeResultOf(result: DropResult): ListPlace | null {
	switch (result.kind) {
		case "list":
			return { kind: "task", group: null, before: result.before };
		case "group":
			return { kind: "task", group: result.group, before: result.before };
		case "nest":
			return { kind: "subtask", parent: result.parent, before: result.before };
		default:
			return null;
	}
}

/** The list redraws when the field moves, switches to a section or back, or the texts waiting before it change; typing only changes the field. */
function movesRows(before: EntryState | null, after: EntryState): boolean {
	if (!before || before.spot !== after.spot || before.renaming !== after.renaming || before.section !== after.section) return true;
	return before.pending.length !== after.pending.length || before.pending.some((line, i) => line.text !== after.pending[i].text || line.level !== after.pending[i].level);
}

/**
 * Typing tasks in place (quick-add spec §4.2–4.9): opens the entry from a double click on a list, the plus, a long tap on the timeline,
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
	/** The drawings so far: a read that drew nothing leaves it as it was. */
	private draws = 0;
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
	/** The field followed into sight and the bar by it: once a frame however often the field moves, grows or scrolls. */
	private readonly pass = new FramePass(() => this.followField());
	/** The pass also brings the field into sight: it was drawn, typed in, or the view resized; a scroll or a slide only moves the bar. */
	private revealing = false;
	/** The list riding the keyboard as it slides. */
	private readonly glide = new ScrollGlide();
	private readonly scrolled = (e: Event) => {
		const state = this.state;
		if (!state) return;
		this.pass.ask();
		const scroller = this.scrollerOf(state.spot);
		if (!scroller || e.target !== scroller) return;
		const at = this.revealedAt.get(scroller);
		if (at !== undefined && Math.abs(scroller.scrollTop - at) < 1) return;
		this.follow = false;
		this.glide.stop();
	};
	/** The columns slid or a card settled: the field may stand elsewhere now, and the bar goes with it. */
	private readonly settled = () => {
		if (this.state) this.pass.ask();
	};
	/** The view grew or shrank, Obsidian's toolbar coming or going under it: the field keeps over the bar in the same frame. */
	private readonly sizeWatch = new ResizeObserver(() => this.reveal());
	private readonly tapAway = (e: Event) => {
		if (!this.state || this.pressEnding || (e.target instanceof Element && this.owns(e.target))) return;
		this.entry.blur();
	};

	constructor(private readonly deps: QuickEntryControllerDeps) {
		this.entry = new QuickEntry({
			cards: (column) => this.cards(column),
			placeOf: (column, result) => this.placeOf(column, result),
			fresh: (beforeShow) => this.fresh(beforeShow),
			createInPlace: (text, priority, place, repeat, labels) => deps.tasks.createInPlace(text, priority, place, repeat, labels),
			createSection: (name, place) => deps.tasks.createSection(name, place),
			sectioned: (column) => deps.sectioned(column),
			edit: (key, draft) => deps.tasks.edit(key, draft),
			placement: (spot) => this.placement(spot),
			isBlank: (text) => deps.tasks.isBlank(text),
			onChange: (state, drawnNext) => this.changed(state, drawnNext),
			onError: (error) => deps.onError(error),
		});
		this.plus = new PlusButton(deps.root, { onTap: () => this.openFromPress(), onDrag: (e, source) => this.dragFromPlus(e, source), arbiter: deps.arbiter });
		this.ring = new PlusRing(deps.root);
		this.bar = new QuickBar(deps.root, {
			desktop: () => deps.desktop(),
			levels: () => deps.tasks.priorityLevels(),
			labels: () => deps.tasks.labelLevels(),
			today: () => deps.today(),
			listName: (list) => deps.tasks.listName(list),
			placementOfDay: (day) => deps.tasks.placementOfDay(day),
			onIndent: (delta) => this.entry.indent(delta),
			onSection: () => this.entry.toggleSection(),
			onPriority: (prefix) => this.choosePriority(prefix),
			onLabels: (names) => this.entry.setLabels(names),
			onPlace: (placement) => void this.moveTo(placement),
			onRepeat: (rule) => this.entry.setRepeat(rule),
		});
		document.addEventListener("click", this.tapAway, true);
		document.addEventListener("pointerdown", this.pressed, true);
		document.addEventListener("mousedown", this.mousePressed, true);
		deps.root.addEventListener("scroll", this.scrolled, true);
		deps.root.addEventListener("transitionend", this.settled, true);
		this.sizeWatch.observe(deps.root);
	}

	/** The No tasks plate of empty section `group` tapped: the field of a new task in it. */
	openIn(column: ListColumn, group: GroupName): void {
		const cards = this.cards(column);
		this.open({ kind: "list", column, place: { kind: "gap", index: gapOfPlace(cards, { kind: "task", group, before: null }).index, level: 0, group } });
	}

	/**
	 * What closes the field when tapped is anything the entry does not own: the field with what its editor shows and the
	 * row it stands in, the bar with all it puts on the page, the plus. Each part says what is its own.
	 */
	private owns(target: Element): boolean {
		const row: EntryPart = { owns: (node) => this.field?.el.parentElement?.contains(node) ?? false };
		const parts: readonly (EntryPart | null)[] = [this.field, row, this.bar, this.plus];
		return parts.some((part) => part?.owns(target));
	}

	/** A double click on a list's free room: the field at the end of the column. */
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
		this.ring.show();
		if (!this.deps.drag.beginNew(source, e, targets, (result) => this.dropped(result))) {
			this.ring.hide();
			return;
		}
		this.carrying = true;
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
		if (found) this.open({ kind: "list", column: found.column, place: gapOfPlace(this.cards(found.column), { kind: "subtask", parent: parent.key, before: null }) });
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
		return { place: state.spot.place, pending: state.pending, section: state.section === true, field: (row) => this.fieldIn(row) };
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
	 * The screen was drawn: the plus, and the field focused and in sight. The cards may
	 * have changed under the field, a written line landing, so what the field may do is read again.
	 */
	rendered(): void {
		this.draws++;
		if (this.state) this.state = this.entry.state;
		this.deps.root.classList.toggle("is-entering", this.state !== null);
		this.showPlus();
		this.placeOffLists(this.state);
		if (!this.state) {
			this.bar.hide();
			return;
		}
		this.sync(this.state);
		const field = this.field;
		if (field?.el.isConnected) {
			if (!this.focused) {
				this.focused = true;
				field.focus();
			} else if (!field.focused) field.refocus();
		}
		this.reveal();
	}

	/**
	 * After a redraw, and as the keyboard shrinks the view, which the bar over a menu follows: while the field is followed,
	 * the list or the timeline scrolls it into sight, at least 16 px over the bar, and a menu raises the parts over its blur
	 * as far as that needs. A list the finger scrolled away stays where it was left.
	 */
	reveal(): void {
		this.revealing = true;
		this.pass.now();
	}

	/**
	 * The phone keyboard starts to slide in or out, the view still as tall as before: the bar rises on the keyboard to where
	 * it will stop, and the field followed into sight scrolls over it, both in the keyboard's time and easing.
	 */
	keyboardSlides(glide: Glide): void {
		const state = this.state;
		if (!state) return;
		this.pass.cancel();
		this.revealing = false;
		const { view, box, rect } = this.measure(state);
		this.followBar(state, rect, view, box, glide.rise);
		if (rect && this.follow) this.bringIntoSight(state, rect, view, box, glide);
	}

	/** The view closes: the text typed is kept, as by a tap elsewhere. */
	close(): void {
		document.removeEventListener("click", this.tapAway, true);
		document.removeEventListener("pointerdown", this.pressed, true);
		document.removeEventListener("mousedown", this.mousePressed, true);
		this.deps.root.removeEventListener("scroll", this.scrolled, true);
		this.deps.root.removeEventListener("transitionend", this.settled, true);
		this.sizeWatch.disconnect();
		this.glide.stop();
		this.revealing = false;
		this.pass.cancel();
		this.entry.blur();
		this.bar.hide();
	}

	/** Where a task written in `column` goes: a list's place, or the day column's on the day it shows. */
	placeOf(column: ListColumn, result: ListPlace): NewTaskPlace {
		if (result.kind === "subtask") return { kind: "subtask", parent: result.parent, before: result.before };
		const { group, before } = result;
		if (column !== "left") return { kind: "list", list: column, group, before };
		return { kind: "day", date: this.deps.day(), group, before };
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

	private find(key: TaskKey): { readonly column: ListColumn; readonly index: number } | null {
		for (const column of LOOK_IN[this.deps.mode()]) {
			const index = this.cards(column).findIndex((card) => samePlace(card.key, key));
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
			leave: () => target.leave(),
			clear: () => target.clear(),
			drop: (x, y, drag) => {
				this.droppedOn = target.column;
				return target.drop(x, y, drag);
			},
		};
	}

	/** The plus came to rest: the field opens where it landed, in a list or in a slot of the timeline. */
	private dropped(result: DropResult | null): void {
		this.carrying = false;
		this.ring.hide();
		const column = this.droppedOn;
		const place = result && column ? placeResultOf(result) : null;
		if (column && place) this.open({ kind: "list", column, place: gapOfPlace(this.cards(column), place) });
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

	/**
	 * One pass over the layout: while the field is followed, the list or the timeline scrolls it into sight, at least 16 px
	 * over the bar, and a menu raises the parts over its blur as far as that needs; then the bar stands by it. The view and
	 * the scroller are measured once; the field again only once it moved.
	 */
	private followField(): void {
		const state = this.state;
		const revealing = this.revealing;
		this.revealing = false;
		if (!state) return;
		const { view, box, field, rect: drawn } = this.measure(state);
		let rect = drawn;
		if (field && rect && revealing && this.follow && this.bringIntoSight(state, rect, view, box)) rect = field.getBoundingClientRect();
		this.followBar(state, rect, view, box);
	}

	/** The view, the field's list or timeline (the view for a menu's stack), and the field where it is drawn. */
	private measure(state: EntryState): { view: DOMRect; box: DOMRect; field: HTMLElement | null; rect: DOMRect | null } {
		const view = this.deps.root.getBoundingClientRect();
		const box = this.scrollerOf(state.spot)?.getBoundingClientRect() ?? view;
		const field = this.field?.el.isConnected ? this.field.el : null;
		return { view, box, field, rect: field?.getBoundingClientRect() ?? null };
	}

	/**
	 * The list or the timeline scrolls the field at `rect` into sight: on the phone at least 16 px over the bar, on the
	 * desktop with room under it for the capsule; a menu raises the parts over its blur. Whether the field moved. With
	 * `glide` the list scrolls along with the keyboard instead of at once.
	 */
	private bringIntoSight(state: EntryState, rect: DOMRect, view: DOMRect, box: DOMRect, glide?: Glide): boolean {
		const limit = this.deps.desktop() ? this.roomOf(view, box).bottom - this.bar.room : view.bottom - this.bar.room - LAYOUT.fieldOverBar;
		const menu = state.spot.kind === "stack" ? this.stack?.menu : null;
		if (menu) {
			menu.raise(menu.raised + rect.bottom - limit);
			return true;
		}
		const scroller = this.scrollerOf(state.spot);
		if (!scroller) return false;
		const top = box.top;
		const by = rect.bottom > limit ? rect.bottom - limit : rect.top < top ? rect.top - top : 0;
		if (glide && by !== 0) {
			this.glide.start(scroller, scroller.scrollTop + by, glide, (at) => this.revealedAt.set(scroller, at));
			return true;
		}
		if (by !== 0) this.glide.stop();
		this.revealedAt.set(scroller, scroller.scrollTop + by);
		if (by !== 0) scroller.scrollTop += by;
		this.revealedAt.set(scroller, scroller.scrollTop);
		return by !== 0;
	}

	/** The bar stands by the field: over a menu's blur above it; on the desktop next to the field, inside what shows of its column. */
	private followBar(state: EntryState, field: DOMRect | null, view: DOMRect, box: DOMRect, rise = 0): void {
		const anchor = {
			field,
			room: this.roomOf(view, box),
			overMenu: state.spot.kind === "stack" ? view : null,
		};
		this.bar.follow(anchor, rise);
	}

	/** What shows of `box`, the field's list or timeline (the view for a menu's stack), down to the top of Obsidian's status bar. */
	private roomOf(view: DOMRect, box: DOMRect): DOMRect {
		const top = Math.max(box.top, view.top);
		const bottom = Math.min(box.bottom, view.bottom, this.deps.chromeTop());
		return new DOMRect(box.left, top, box.width, Math.max(0, bottom - top));
	}

	private showPlus(): void {
		this.plus.hidden = this.state !== null || this.dragging || this.carrying;
	}

	/**
	 * The lists read afresh; with `beforeShow`, the entry changes as they draw what was read. A read the same as shown, or
	 * one a gesture holds back, draws nothing then: the entry's change is drawn here, or waits with the gesture.
	 */
	private async fresh(beforeShow?: (coming: (column: ListColumn) => readonly ListCard[]) => void): Promise<void> {
		if (!beforeShow) return this.deps.fresh();
		let mark = -1;
		await this.deps.fresh(() => {
			beforeShow((column) => this.deps.list(column)?.comingCards ?? []);
			mark = this.draws;
		});
		if (mark === this.draws) this.deps.render();
	}

	private changed(state: EntryState | null, drawnNext = false): void {
		const before = this.state;
		this.state = state;
		if (state?.renaming !== before?.renaming) this.moved = false;
		if (!state) {
			this.glide.stop();
			this.revealing = false;
			this.pass.cancel();
			this.dropField();
			this.bar.hide();
			this.placeOffLists(null);
		}
		const moves = !state || movesRows(before, state);
		if (state && moves) this.follow = true;
		if (drawnNext && state) return;
		if (moves) this.deps.render();
		else {
			this.sync(state);
			this.pass.ask();
		}
	}

	/** The field and the bar show the state: its text, the marks it is written with, what the field may do. */
	private sync(state: EntryState): void {
		const marks = this.marksOf(state);
		if (this.field && this.field.text !== state.text) this.field.setValue(state.text);
		this.field?.setSection(state.section === true);
		if (!state.section) this.field?.setTint(marks.priority?.color ?? marks.labels[0]?.color ?? null);
		this.bar.show(this.barState(state, marks));
	}

	private barState(state: EntryState, marks: DraftMarks): QuickBarState {
		const place = this.shownPlace(state);
		return { canIndent: state.canIndent, canOutdent: state.canOutdent, indents: state.spot.kind === "list", marks, place, repeat: state.repeat, repeatable: state.spot.kind !== "slot", section: state.section };
	}

	/** The priority and labels the field's task is written with, as the service answers for its text and choices. */
	private marksOf(state: EntryState): DraftMarks {
		return this.deps.tasks.draftMarks(state.text, state.priority, state.labels);
	}

	/** A level chosen in the bar takes the place of a prefix typed: the text keeps no prefix, so the file gets one. */
	private choosePriority(prefix: string | null): void {
		const state = this.state;
		if (!state) return;
		if (this.deps.tasks.parseTitle(state.text).priority) this.entry.type(this.deps.tasks.withPriority(state.text, null));
		this.entry.setPriority(prefix);
	}

	/** The place button: a subtask's field, new or renamed, has none, nor does one off the lists. */
	private shownPlace(state: EntryState): Placement | null {
		const { spot, renaming } = state;
		if (spot.kind !== "list") return null;
		if (renaming) return renaming.isSubtask ? null : this.placement(spot);
		return spot.place.level > 0 ? null : this.columnPlacement(spot.column);
	}

	/** Where a renamed task goes: where it was, until a place is chosen in the bar. */
	private placement(spot: EntrySpot): Placement {
		const item = this.state?.renaming ?? null;
		if (spot.kind === "list" && (this.moved || !item)) return this.columnPlacement(spot.column);
		return item ? this.deps.tasks.placementOf(item) : this.columnPlacement("left");
	}

	private columnPlacement(column: ListColumn): Placement {
		return column === "left" ? this.deps.tasks.placementOfDay(this.deps.day()) : { kind: column };
	}

	/**
	 * A place chosen in the bar: the field goes to the end of that column at once, still in the tap that keeps the
	 * keyboard up, and the wheel turns to show the column. Another day opens in the day column once what was typed is
	 * written, as it was written for the day shown; the field then goes to the end of that day's list.
	 */
	private async moveTo(placement: Placement): Promise<void> {
		const column: ListColumn = placement.kind === "now" || placement.kind === "date" ? "left" : placement.kind;
		const date = this.deps.tasks.dayOfPlacement(placement);
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
		const handle: QuickFieldHandle = QuickField.open(row, {
			value: state?.text ?? "",
			parseTitle: (text) => this.deps.tasks.parseTitle(text),
			priority: state ? this.marksOf(state).priority : null,
			titleField: this.deps.titleField,
			onInput: (text) => {
				this.entry.type(text);
				this.follow = true;
				this.revealing = true;
				this.pass.ask();
			},
			onPriority: () => {
				if (!this.state) return;
				this.sync(this.state);
				this.pass.ask();
			},
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
		else if (key === "altTab") this.entry.toggleSection();
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
