import { type EntryDrawing, type EntrySpot, type EntryState, type GroupName, type ListCard, type Placement, QuickEntrySession, type QuickEntryTasks, type TaskItem, type TaskKey, type TaskService } from "../../../core/application/contracts";
import { placeShowing, shownLists } from "../screens";
import type { RightMode } from "../viewSettings";
import type { EntryPart } from "./EntryPart";
import { DURATION, EASING, LAYOUT, tokenMs } from "../design";
import { easingOf } from "../easing";
import { FramePass } from "../FramePass";
import type { Glide } from "../Keyboard";
import type { DragController } from "../drag/DragController";
import { type DropTarget, type ListColumn, type DropResult, isProjectsDrop } from "../drag/DropTarget";
import type { GestureArbiter } from "../gestures";
import type { CloseHow } from "../menu/Overlay";
import type { TaskMenu } from "../menu/TaskMenu";
import type { ListEntryInput, TaskList } from "../TaskList";
import type { Timeline } from "../Timeline";
import type { LocalDate, Slot } from "../types";
import { RenamedTexts } from "../RenamedTexts";
import { PlusButton } from "./PlusButton";
import { PlusRing } from "./PlusRing";
import { QuickBar } from "./QuickBar";
import { QuickField, type QuickFieldHandle, type QuickKey } from "./QuickField";
import { ScrollGlide } from "./ScrollGlide";
import type { TitleFieldFactory } from "./TitleField";
import { WriteQueue } from "./WriteQueue";

/** A list as a place to drop, and the column it is. */
export type ColumnDrop = DropTarget & { readonly column: ListColumn };

/** The list columns a field types in. */
const COLUMNS: readonly ListColumn[] = ["day", "soon", "inbox", "backlog"];

export interface QuickEntryControllerDeps {
	/** The view's content: the plus and the bar go in it, the bar last, at its bottom. */
	readonly root: HTMLElement;
	readonly tasks: QuickEntryTasks & Pick<TaskService, "listName" | "placementTitle" | "projects" | "newProject" | "unfoldAbove">;
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
	/** The plus on a screen of its own (the Projects screen): where it may be carried, and what a tap and a drop do there; null elsewhere. */
	aside?(): PlusAside | null;
	/** Redraws the lists and the timeline, which calls `rendered` once drawn. */
	render(): void;
	/** A write that failed. */
	onError(error: unknown): void;
}

/** The plus on a screen that is no list of the funnel: its own places, its own tap and drop. */
export interface PlusAside {
	readonly targets: readonly DropTarget[];
	tap(): void;
	dropped(result: DropResult): void;
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

/** The list redraws when the field moves, switches to a section or back, or the texts waiting before it change; typing only changes the field. */
export function movesRows(before: EntryState | null, after: EntryState): boolean {
	if (!before || before.spot !== after.spot || before.renaming !== after.renaming || before.section !== after.section) return true;
	return before.pending.length !== after.pending.length || before.pending.some((line, i) => line.text !== after.pending[i].text || line.level !== after.pending[i].level);
}

/**
 * Typing tasks in place (quick-add spec §4.2–4.9): opens the entry from a double click on a list, the plus, a long tap on the timeline,
 * the task menu; draws the field in its list, in its slot or over its card on the timeline, or last in a calendar menu's
 * stack of subtasks, and keeps it focused across redraws, 16 px over the bar; shows the bar and hides the plus while the
 * entry is open. What the entry means is QuickEntrySession's.
 */
export class QuickEntryController {
	private readonly entry: QuickEntrySession;
	private readonly bar: QuickBar;
	private readonly plus: PlusButton;
	private readonly ring: PlusRing;
	private state: EntryState | null = null;
	private field: QuickFieldHandle | null = null;
	/** The field took the focus with its own selection; after that a redraw only gives it back. */
	private focused = false;
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
	/** The renames typed here, told to every card drawn (`RenamedTexts`) until they are written; this ends the telling. */
	private readonly renames: () => void;
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
		this.entry = new QuickEntrySession(
			this.telling(deps.tasks),
			{
				cards: (column) => this.cards(column),
				sections: (column) => deps.list(column)?.sections ?? [],
				sectioned: (column) => deps.sectioned(column),
				day: () => deps.day(),
				today: () => deps.today(),
				shown: () => shownLists(deps.mode()),
				fresh: (beforeShow) => this.fresh(beforeShow),
				onChange: (state, drawnNext) => this.changed(state, drawnNext),
			},
			new WriteQueue((error) => deps.onError(error)),
		);
		this.renames = RenamedTexts.add(() => this.entry.renamed);
		this.plus = new PlusButton(deps.root, { onTap: () => this.openFromPress(), onDrag: (e, source) => this.dragFromPlus(e, source), arbiter: deps.arbiter });
		this.ring = new PlusRing(deps.root);
		this.bar = new QuickBar(deps.root, {
			desktop: () => deps.desktop(),
			today: () => deps.today(),
			listName: (list) => deps.tasks.listName(list),
			placementTitle: (placement) => deps.tasks.placementTitle(placement),
			placementOfDay: (day) => deps.tasks.placementOfDay(day),
			onIndent: (delta) => this.entry.indent(delta),
			onSection: () => this.entry.toggleSection(),
			onPriority: (prefix) => this.entry.togglePriority(prefix),
			onLabel: (name) => this.entry.toggleLabel(name),
			onPlace: (placement) => void this.moveTo(placement),
			onRepeat: (rule) => this.entry.setRepeat(rule),
			onProject: (link) => this.entry.setProject(link),
			onNewProject: (name) => void this.newProject(name),
			onNameEnd: () => this.field?.refocus(),
		});
		deps.root.ownerDocument.addEventListener("click", this.tapAway, true);
		deps.root.ownerDocument.addEventListener("pointerdown", this.pressed, true);
		deps.root.ownerDocument.addEventListener("mousedown", this.mousePressed, true);
		deps.root.addEventListener("scroll", this.scrolled, true);
		deps.root.addEventListener("transitionend", this.settled, true);
		this.sizeWatch.observe(deps.root);
	}

	/** The No tasks plate of empty section `group` tapped: the field of a new task in it. */
	openIn(column: ListColumn, group: GroupName): void {
		this.dropField();
		this.entry.openIn(column, group);
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
		this.dropField();
		this.entry.openAtEnd(column);
	}

	/** The plus tapped: the field where the session opens a new task. */
	openFromPlus(): void {
		this.dropField();
		this.entry.openFromPlus();
	}

	/** The plus tapped: the field opens as the press ends, and what that press still sends is not a tap elsewhere. */
	private openFromPress(): void {
		const aside = this.deps.aside?.() ?? null;
		if (aside) return aside.tap();
		this.pressEnding = true;
		this.openFromPlus();
	}

	/** The plus taken: carried as a task is, and let go on a list, the field opens where the drop showed. */
	dragFromPlus(e: PointerEvent, source: HTMLElement): void {
		const aside = this.deps.aside?.() ?? null;
		if (aside) return this.dragAside(e, source, aside);
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

	/** The plus carried over a screen of its own: let go on one of its places, that screen opens its field there. */
	private dragAside(e: PointerEvent, source: HTMLElement, aside: PlusAside): void {
		const dropped = (result: DropResult | null): null => {
			this.carrying = false;
			this.ring.hide();
			this.showPlus();
			if (result && isProjectsDrop(result)) aside.dropped(result);
			return null;
		};
		this.ring.show();
		if (!this.deps.drag.beginNew(source, e, [this.ring, ...aside.targets], dropped)) {
			this.ring.hide();
			return;
		}
		this.carrying = true;
		this.showPlus();
	}

	/** A long tap on the timeline's free room let go: the field of a new task in the slot it showed. */
	openSlot(slot: Slot): void {
		this.pressEnding = true;
		this.dropField();
		this.entry.openSlot(slot);
	}

	/**
	 * The field as the last subtask of `parent`: in the list that shows it; for a task only on the calendar, last in the
	 * stack of its calendar menu, which stays open for it. Any other menu closes.
	 */
	addSubtask(parent: TaskItem, menu?: TaskMenu): void {
		const spot = this.entry.subtaskSpot(parent.key);
		switch (spot.kind) {
			case "stack":
				if (menu?.stacks) this.openStack(parent, spot, menu);
				else menu?.close();
				return;
			default:
				menu?.close();
				this.open(spot);
		}
	}

	/**
	 * The card becomes the field, with its text: in a list the field stands right before the card, which hides; a subtask
	 * tapped in a calendar menu's stack is renamed in its card there, the menu kept open for it; a task only on the
	 * calendar is renamed in its card on the timeline, where it keeps its place. Any other menu closes.
	 */
	rename(item: TaskItem, menu?: TaskMenu): void {
		const spot = this.entry.renameSpot(item, !!menu?.inStack);
		switch (spot?.kind) {
			case "stack":
				if (menu) this.renameInMenu(item, spot, menu);
				return;
			default:
				menu?.close();
				if (spot) this.open(spot, item);
		}
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
	entryIn(column: ListColumn, drawing: EntryDrawing): ListEntryInput | null {
		const entry = this.state && this.entry.listEntry(column, drawing);
		return entry ? { at: entry.at, level: entry.place.level, pending: entry.pending, section: entry.section, field: (row) => this.fieldIn(row) } : null;
	}

	/** The task being renamed, whose card every list hides while the rename is open, wherever the field stands (§4.8). */
	renaming(): TaskKey | null {
		return this.entry.renaming;
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
		this.deps.root.ownerDocument.removeEventListener("click", this.tapAway, true);
		this.deps.root.ownerDocument.removeEventListener("pointerdown", this.pressed, true);
		this.deps.root.ownerDocument.removeEventListener("mousedown", this.mousePressed, true);
		this.deps.root.removeEventListener("scroll", this.scrolled, true);
		this.deps.root.removeEventListener("transitionend", this.settled, true);
		this.sizeWatch.disconnect();
		this.renames();
		this.glide.stop();
		this.revealing = false;
		this.pass.cancel();
		this.entry.blur();
		this.bar.hide();
	}

	private open(spot: EntrySpot, renaming?: TaskItem): void {
		this.dropField();
		this.entry.open(spot, renaming);
	}

	private cards(column: ListColumn): readonly ListCard[] {
		return this.deps.list(column)?.listCards ?? [];
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
	/** The service as the session writes through it, each task the field writes told to the lists by the id the write answers: its card takes the typed text's row. */
	private telling(tasks: QuickEntryControllerDeps["tasks"]): QuickEntryTasks {
		return {
			projects: () => tasks.projects(),
			placementOf: (...a) => tasks.placementOf(...a),
			placementOfDay: (...a) => tasks.placementOfDay(...a),
			dayOfPlacement: (...a) => tasks.dayOfPlacement(...a),
			parseTitle: (...a) => tasks.parseTitle(...a),
			isBlank: (...a) => tasks.isBlank(...a),
			withPriority: (...a) => tasks.withPriority(...a),
			draftMarks: (...a) => tasks.draftMarks(...a),
			newSlot: (...a) => tasks.newSlot(...a),
			createSection: (...a) => tasks.createSection(...a),
			edit: (...a) => tasks.edit(...a),
			unfoldAbove: (...a) => tasks.unfoldAbove(...a),
			createWithId: async (...a) => {
				const created = await tasks.createWithId(...a);
				if (created) for (const column of COLUMNS) this.deps.list(column)?.adopt(created.id);
				return created;
			},
		};
	}

	/** The plus let go: on a place the field opens there in the same tap, and the plus lands in it (this gives the field). */
	private dropped(result: DropResult | null): HTMLElement | null {
		this.carrying = false;
		this.ring.hide();
		this.dropField();
		if (result && isProjectsDrop(result)) {
			this.showPlus();
			return null;
		}
		if (!this.entry.openAtDrop(this.droppedOn, result)) {
			this.showPlus();
			return null;
		}
		return this.field?.el.isConnected ? this.field.el : null;
	}

	/** The menu stays over the screen, its panel gone, and the field stands last in its stack of subtasks. */
	private openStack(parent: TaskItem, spot: EntrySpot, menu: TaskMenu): void {
		this.stack = { menu, row: menu.openStack((how) => this.menuClosed(menu, how)), parent };
		this.open(spot);
	}

	/** The card of the stack becomes the field, in a calendar menu kept open; the spot is the menu's, of the task itself, where nothing new is written. */
	private renameInMenu(item: TaskItem, spot: EntrySpot, menu: TaskMenu): void {
		this.stack = { menu, row: menu.openRename((how) => this.menuClosed(menu, how)), parent: null };
		this.open(spot, item);
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
		const menu = this.stack?.menu ?? null;
		if (menu) {
			menu.raise(menu.raised + rect.bottom - limit);
			return true;
		}
		const scroller = this.scrollerOf(state.spot);
		if (!scroller) return false;
		const top = box.top;
		const by = rect.bottom > limit ? rect.bottom - limit : rect.top < top ? rect.top - top : 0;
		const smooth = glide ?? this.smoothScroll();
		if (smooth && by !== 0) {
			this.glide.start(scroller, scroller.scrollTop + by, smooth, (at) => this.revealedAt.set(scroller, at));
			return true;
		}
		if (by !== 0) this.glide.stop();
		this.revealedAt.set(scroller, scroller.scrollTop + by);
		if (by !== 0) scroller.scrollTop += by;
		this.revealedAt.set(scroller, scroller.scrollTop);
		return by !== 0;
	}

	/** Every scroll the plugin makes for the field is one smooth scroll, in the list's motion tokens; none where nothing moves (a test). */
	private smoothScroll(): Glide | null {
		const root = this.deps.root;
		const ms = tokenMs(root, DURATION.collapse);
		return ms > 0 ? { ms, ease: easingOf(getComputedStyle(root).getPropertyValue(EASING.out)), rise: 0 } : null;
	}

	/** The bar stands by the field: over a menu's blur above it; on the desktop next to the field, inside what shows of its column. */
	private followBar(state: EntryState, field: DOMRect | null, view: DOMRect, box: DOMRect, rise = 0): void {
		const anchor = {
			field,
			room: this.roomOf(view, box),
			overMenu: this.stack ? view : null,
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
		if (!state) {
			for (const column of COLUMNS) this.deps.list(column)?.forgetTyped();
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
		if (this.field) this.dress(this.field, state);
		this.bar.show(state);
	}

	/** The field shows the state's text, as a section's or a task's, in its tint. */
	private dress(field: QuickFieldHandle, state: EntryState): void {
		if (field.text !== state.text) field.setValue(state.text);
		field.setSection(state.section === true);
		field.setTint(state.marks.tint);
	}

	/**
	 * A place chosen in the bar: the field goes to the end of that column at once, still in the tap that keeps the
	 * keyboard up, and the wheel turns to show the column. Another day opens in the day column once what was typed is
	 * written, as it was written for the day shown; the field then goes to the end of that day's list.
	 */
	private async moveTo(placement: Placement): Promise<void> {
		const move = this.entry.choosePlace(placement);
		if (!move) return;
		this.turning = true;
		try {
			this.deps.turnTo(placeShowing(move.column, this.deps.mode()));
		} finally {
			this.turning = false;
		}
		if (move.day === null) return;
		await this.entry.idle();
		await this.deps.showDay(move.day);
		this.entry.moveToEnd(move.column);
	}

	private fieldIn(row: HTMLElement): HTMLElement {
		const field = (this.field ??= this.openField(row));
		const state = this.entry.state;
		if (state) this.dress(field, state);
		for (const child of [...row.children]) if (child !== field.el) child.remove();
		if (field.el.parentElement !== row) row.appendChild(field.el);
		return field.el;
	}

	private openField(row: HTMLElement): QuickFieldHandle {
		const state = this.state;
		const handle: QuickFieldHandle = QuickField.open(row, {
			value: state?.text ?? "",
			tint: state?.marks.tint ?? null,
			titleField: this.deps.titleField,
			onInput: (text) => {
				this.entry.type(text);
				this.follow = true;
				this.revealing = true;
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
			if (this.field === handle && this.state && !handle.focused && !this.bar.typing) this.entry.blur();
		});
	}

	/** «New project…» on the bar: the project made at the tree's top (`TaskService.newProject`, no task yet), then the field's project. */
	private async newProject(name: string): Promise<void> {
		try {
			const project = await this.deps.tasks.newProject(name, []);
			if (project && this.state) this.entry.setProject(project.name);
		} catch (error) {
			this.deps.onError(error);
		}
	}
}
