import type { TaskItem } from "../../application/contracts";
import { shownCardSize } from "../cardSize";
import { LAYOUT } from "../design";
import { stretchedSpan } from "../timelineLayout";
import { capturePointer, el, releasePointer } from "../dom";
import type { GestureArbiter } from "../gestures";
import type { Haptics } from "../haptics";
import type { ResizeEdge, Timeline } from "../Timeline";
import type { TimelineDrop } from "./TimelineDrop";
import type { LocalDate, Slot } from "../types";
import { DragSession } from "./DragSession";
import type { DropResult, DropTarget, NewTaskPayload, TaskDragPayload, TaskOrigin } from "./DropTarget";
import { FloatingCard } from "./FloatingCard";
import { PlusFloat } from "./PlusFloat";
import { LongPress } from "./LongPress";
import { snapMinutes } from "./snap";
import type { PickedCard } from "../TaskSelection";

const WAITING = "is-waiting";

export interface DragControllerDeps {
	longPressMs(): number;
	/** The day on screen: the card under the finger leaves out a due date on it, as the list does. */
	day(): LocalDate;
	step(): number;
	timeline(): Timeline | null;
	/** Where `drag` may land: the lists and the timeline shown, and the place that cancels several cards carried at once. */
	targets(drag: TaskDragPayload): readonly DropTarget[];
	/**
	 * A list card clicked (`tap`) or right-clicked (`menu`): true when the click picked cards or opened the menu for the
	 * picked ones, so the card's own menu stays shut.
	 */
	pick?(item: TaskItem, card: HTMLElement, e: MouseEvent, how: "tap" | "menu"): boolean;
	/** The other picked cards that go along when `item` is lifted; none when it is not picked or picked alone. */
	carried?(item: TaskItem): readonly PickedCard[];
	readonly haptics: Haptics;
	readonly arbiter: GestureArbiter;
	/** A card is lifted or settled: the lists hide New task while it is carried. */
	onDragging(active: boolean): void;
	onResult(drag: TaskDragPayload, result: DropResult): Promise<void>;
	onResize(item: TaskItem, slot: Slot): Promise<void>;
	/** Opens the task menu over `source`; `lifted` dresses the copy of the card that stays over the blur. */
	onMenu(item: TaskItem, source: HTMLElement, lifted?: (copy: HTMLElement, close: () => void) => void): OpenMenu;
	/** A card or block double-clicked: its title is renamed in place, no menu. */
	onRename(item: TaskItem): void;
	/** A long tap on an empty place of the timeline, let go: the field of a new task in the slot the target showed. */
	newSlot(): TimelineDrop | null;
	onNewSlot(slot: Slot): void;
}

export interface OpenMenu {
	close(): void;
	/** A second click on the copy right after the click that opened the menu: the menu goes and `then` runs. */
	onClickedAgain(then: () => void): void;
}

const DRAG = "drag";
const RESIZE = "resize";
const NEW_SLOT = "newslot";

/**
 * Gives a card its gestures: the tap that opens its menu, the double click that renames it, the long press that lifts it, the drag that follows. A card on
 * the timeline answers a long press like Apple Calendar: it is selected, its menu opens, and moving the finger on from
 * there drags it; the dots of a selected card stretch it. While a gesture owns the screen the view keeps the browser from
 * scrolling (see the arbiter).
 */
export class DragController {
	constructor(private readonly deps: DragControllerDeps) {}

	/** `subtree`: the cards of the task's subtasks, which gather under it while it is dragged. */
	attachCard(card: HTMLElement, item: TaskItem, from: TaskOrigin, subtree: readonly HTMLElement[] = []): void {
		card.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			if (!this.deps.pick?.(item, card, e, "menu")) this.deps.onMenu(item, card);
		});
		new LongPress(card, {
			delayMs: () => this.deps.longPressMs(),
			busy: () => this.deps.arbiter.busy,
			onStart: (e) => {
				const carried = this.deps.carried?.(item) ?? [];
				const payload = { ...this.payload(card, item, from, e), carried: carried.map((c) => ({ item: c.item, from: c.column })) };
				this.begin(card, payload, e, subtree, carried);
			},
			onTap: (e) => {
				if (!this.deps.pick?.(item, card, e, "tap")) this.tapped(e, item, this.deps.onMenu(item, card));
			},
		});
	}

	attachBlock(block: HTMLElement, item: TaskItem): void {
		block.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.selectWithMenu(block, item);
		});
		new LongPress(block, {
			delayMs: () => this.deps.longPressMs(),
			busy: () => this.deps.arbiter.busy,
			onStart: (e) => (e.pointerType === "mouse" ? this.begin(block, this.payload(block, item, "timeline", e), e) : this.hold(block, item, e)),
			onTap: (e) => this.tapped(e, item, this.deps.onMenu(item, block)),
			onLongTap: () => this.selectWithMenu(block, item),
		});
	}

	/** An event can't be moved: a tap, a held finger, a long click or a right click open its menu. */
	attachEvent(block: HTMLElement, onMenu: () => void): void {
		block.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			onMenu();
		});
		new LongPress(block, {
			delayMs: () => this.deps.longPressMs(),
			busy: () => this.deps.arbiter.busy,
			onStart: (e) => {
				if (e.pointerType !== "mouse") onMenu();
			},
			onTap: onMenu,
			onLongTap: onMenu,
		});
	}

	private payload(card: HTMLElement, item: TaskItem, from: TaskOrigin, e: PointerEvent): TaskDragPayload {
		const onTimeline = from === "timeline" && item.slot;
		const durationMin = onTimeline && item.slot!.end !== null ? item.slot!.end - item.slot!.start : null;
		const rect = card.getBoundingClientRect();
		const grabPx = onTimeline ? e.clientY - rect.top : shownCardSize().height / 2;
		return { item, from, durationMin, grabPx, grabX: e.clientX - rect.left };
	}

	/** A click opens the menu at once; a second one, on the copy now over the card, makes it a double click that renames. */
	private tapped(e: PointerEvent, item: TaskItem, menu: OpenMenu): void {
		if (e.pointerType === "mouse") menu.onClickedAgain(() => this.deps.onRename(item));
	}

	/** Selects the card and opens its menu; the dots on the copy over the blur stretch the card as its own do. */
	private selectWithMenu(block: HTMLElement, item: TaskItem): OpenMenu {
		this.deps.timeline()?.select(item);
		return this.deps.onMenu(item, block, (copy, close) => this.gripsOn(copy, block, item, close));
	}

	/** A dot of the selected card taken. */
	grip(block: HTMLElement, item: TaskItem, edge: ResizeEdge, e: PointerEvent): void {
		if (!this.deps.arbiter.busy) this.beginResize(block, item, edge, e);
	}

	/** A finger held on a timeline card: selected, the menu open; moving on closes the menu and drags the card. */
	private hold(block: HTMLElement, item: TaskItem, e: PointerEvent): void {
		this.deps.haptics.tap();
		const menu = this.selectWithMenu(block, item);
		capturePointer(block, e.pointerId);
		const detach = () => {
			document.removeEventListener("pointermove", move);
			document.removeEventListener("pointerup", end);
			document.removeEventListener("pointercancel", end);
		};
		const move = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId || Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) <= LAYOUT.pressTolerance) return;
			detach();
			menu.close();
			this.deps.timeline()?.select(null);
			this.begin(block, this.payload(block, item, "timeline", e), ev);
		};
		const end = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			detach();
			releasePointer(block, e.pointerId);
		};
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerup", end);
		document.addEventListener("pointercancel", end);
	}

	/** The dots on the copy of the card over the menu's blur stretch the card itself; a dot taken closes the menu. */
	private gripsOn(copy: HTMLElement, block: HTMLElement, item: TaskItem, closeMenu: () => void): void {
		for (const edge of ["start", "end"] as const) {
			el(copy, "span", `tc-grip is-${edge}`).addEventListener("pointerdown", (e) => {
				if (!e.isPrimary || e.button !== 0 || this.deps.arbiter.busy) return;
				e.stopPropagation();
				e.preventDefault();
				closeMenu();
				this.beginResize(block, item, edge, e);
			});
		}
	}

	/** The timeline's empty places: a long tap shows the target for a new task, moving slides it, lifting opens the field there. */
	attachCanvas(canvas: HTMLElement): void {
		const onEmpty = (e: PointerEvent) => this.beginNewSlot(canvas, e);
		new LongPress(canvas, {
			delayMs: () => this.deps.longPressMs(),
			busy: () => this.deps.arbiter.busy,
			accepts: (e) => !(e.target as Element | null)?.closest(".tc-block, .tc-event, .tc-drop"),
			onStart: onEmpty,
			onLongTap: onEmpty,
		});
	}

	private beginNewSlot(canvas: HTMLElement, e: PointerEvent): void {
		const drop = this.deps.newSlot();
		if (!drop || !this.deps.arbiter.claim(NEW_SLOT)) return;
		this.deps.haptics.tap();
		this.deps.timeline()?.select(null);
		drop.previewNew(e.clientY);
		capturePointer(canvas, e.pointerId);
		const move = (ev: PointerEvent) => {
			if (ev.pointerId === e.pointerId) drop.previewNew(ev.clientY);
		};
		const finish = (ev: PointerEvent, open: boolean) => {
			if (ev.pointerId !== e.pointerId) return;
			document.removeEventListener("pointermove", move);
			document.removeEventListener("pointerup", up);
			document.removeEventListener("pointercancel", cancel);
			releasePointer(canvas, e.pointerId);
			this.deps.arbiter.release(NEW_SLOT);
			const slot = drop.slot;
			drop.clear();
			if (open) this.deps.onNewSlot(slot);
		};
		const up = (ev: PointerEvent) => finish(ev, true);
		const cancel = (ev: PointerEvent) => finish(ev, false);
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerup", up);
		document.addEventListener("pointercancel", cancel);
	}

	/** `carried`: the other picked cards, lifted with this one; each waits as a dashed place where it stood until the pointer is over its list. */
	private begin(source: HTMLElement, payload: TaskDragPayload, e: PointerEvent, subtree: readonly HTMLElement[] = [], carried: readonly PickedCard[] = []): void {
		if (!this.deps.arbiter.claim(DRAG)) return;
		this.deps.haptics.tap();
		const origin = source.getBoundingClientRect();
		const float = new FloatingCard(payload.item, { dx: e.clientX - origin.left, dy: e.clientY - origin.top }, this.deps.day(), 1 + carried.length);
		float.moveTo(e.clientX, e.clientY);
		const timeline = payload.from === "timeline" ? this.deps.timeline() : null;
		const lifted = [source, ...subtree, ...carried.flatMap((c) => [c.card, ...c.subtree])];
		for (const card of lifted) card.classList.add("is-lifted");
		if (carried.length > 0) for (const card of lifted) card.classList.add(WAITING);
		timeline?.layoutTasks();
		capturePointer(source, e.pointerId);
		this.deps.onDragging(true);
		const reopen = () => {
			for (const card of lifted) card.classList.remove("is-lifted", WAITING);
			timeline?.layoutTasks();
		};
		this.follow(
			source,
			e,
			(detach) =>
				new DragSession({
					payload,
					targets: this.deps.targets(payload),
					float,
					origin,
					onReturn: reopen,
					onEnd: async (result) => {
						detach();
						this.deps.arbiter.release(DRAG);
						if (!result) return;
						this.deps.haptics.tap();
						await this.deps.onResult(payload, result);
					},
				}),
			() => this.deps.onDragging(false),
		);
	}

	/**
	 * The plus taken: the plus itself follows the finger over the same targets as a task, but no card is lifted. Let go
	 * off every target, or cancelled, the plus flies back to `source` and `onDrop` hears null; let go on one, `onDrop` hears where once it has landed. False when another gesture holds the screen: nothing starts.
	 */
	beginNew(source: HTMLElement, e: PointerEvent, targets: readonly DropTarget[], onDrop: (result: DropResult | null) => void): boolean {
		if (!this.deps.arbiter.claim(DRAG)) return false;
		this.deps.haptics.tap();
		const origin = source.getBoundingClientRect();
		const float = new PlusFloat({ dx: e.clientX - origin.left, dy: e.clientY - origin.top });
		float.moveTo(e.clientX, e.clientY);
		capturePointer(source, e.pointerId);
		const payload: NewTaskPayload = { from: "new", item: null, durationMin: null, grabPx: e.clientY - origin.top, grabX: e.clientX - origin.left };
		let placed: DropResult | null = null;
		this.follow(
			source,
			e,
			(detach) =>
				new DragSession({
					payload,
					targets,
					float,
					origin,
					onEnd: async (result) => {
						detach();
						placed = result;
					},
				}),
			() => {
				this.deps.arbiter.release(DRAG);
				if (placed) this.deps.haptics.tap();
				onDrop(placed);
			},
		);
		return true;
	}

	/**
	 * Routes the pointer of `e` to the session until it ends; `settled` runs once the card has come to rest. The session
	 * sees the finger where it lifted the card at once: a card lifted from a list keeps its place there open from the start.
	 */
	private follow(source: HTMLElement, e: PointerEvent, makeSession: (detach: () => void) => DragSession, settled: () => void): void {
		const session = makeSession(() => detach());
		session.move(e.clientX, e.clientY);
		const move = (ev: PointerEvent) => {
			if (ev.pointerId === e.pointerId) session.move(ev.clientX, ev.clientY);
		};
		let ended = false;
		const end = (settling: () => Promise<void>) => {
			if (ended) return;
			ended = true;
			document.removeEventListener("keydown", escape, true);
			void settling().then(settled);
		};
		const up = (ev: PointerEvent) => {
			if (ev.pointerId === e.pointerId) end(() => session.release(ev.clientX, ev.clientY));
		};
		const cancel = (ev: PointerEvent) => {
			if (ev.pointerId === e.pointerId) end(() => session.cancel());
		};
		/** Escape puts the cards back where they were, as a cancelled drag does. */
		const escape = (ev: KeyboardEvent) => {
			if (ev.key !== "Escape") return;
			ev.preventDefault();
			ev.stopPropagation();
			end(() => session.cancel());
		};
		const detach = () => {
			document.removeEventListener("keydown", escape, true);
			document.removeEventListener("pointermove", move);
			document.removeEventListener("pointerup", up);
			document.removeEventListener("pointercancel", cancel);
			releasePointer(source, e.pointerId);
		};
		document.addEventListener("keydown", escape, true);
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerup", up);
		document.addEventListener("pointercancel", cancel);
	}

	/**
	 * A dot moves one edge by 15 minutes at a time and the stack follows. Let go at 40 px or less, the task loses its
	 * duration; the start dot of a task without one pulls the start earlier, the old start becoming the end.
	 */
	private beginResize(block: HTMLElement, item: TaskItem, edge: ResizeEdge, e: PointerEvent): void {
		const timeline = this.deps.timeline();
		if (!timeline || !item.slot || !this.deps.arbiter.claim(RESIZE)) return;
		const slot = timeline.shownSpan(item);
		this.deps.haptics.tap();
		capturePointer(block, e.pointerId);
		const step = this.deps.step();
		let start = slot.start;
		let end = slot.end ?? slot.start;
		const move = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			const at = snapMinutes(timeline.minutesAt(ev.clientY), step);
			if (edge === "end") end = Math.min(LAYOUT.minutesPerDay, Math.max(start, at));
			else if (slot.end === null) start = Math.max(0, Math.min(at, slot.start));
			else start = Math.max(0, Math.min(at, end));
			timeline.stretchTo(block, { start, end }, edge);
		};
		const finish = async (ev: PointerEvent, apply: boolean) => {
			if (ev.pointerId !== e.pointerId) return;
			document.removeEventListener("pointermove", move);
			document.removeEventListener("pointerup", up);
			document.removeEventListener("pointercancel", cancel);
			releasePointer(block, e.pointerId);
			const next = stretchedSpan(slot, { start, end }, edge, timeline.hourPx, shownCardSize().height);
			const changed = next.start !== slot.start || next.end !== slot.end;
			if (apply && changed) {
				this.deps.haptics.tap();
				await this.deps.onResize(item, timeline.slotAt(next.start, next.end));
			} else timeline.stretchTo(block, null, edge);
			this.deps.arbiter.release(RESIZE);
		};
		const up = (ev: PointerEvent) => void finish(ev, true);
		const cancel = (ev: PointerEvent) => void finish(ev, false);
		timeline.stretchTo(block, { start, end }, edge);
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerup", up);
		document.addEventListener("pointercancel", cancel);
	}

}
