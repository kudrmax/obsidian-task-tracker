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
import type { DropResult, DropTarget, NewTaskPayload, PlacedResult, TaskDragPayload, TaskOrigin } from "./DropTarget";

/** A drop on New section: the column it was under, and whose sections. */
export type NameGroup = Extract<DropResult, { readonly kind: "nameGroup" }>;
import { FloatingCard } from "./FloatingCard";
import { LongPress } from "./LongPress";
import { snapMinutes } from "./snap";

export interface DragControllerDeps {
	longPressMs(): number;
	/** The day on screen: the card under the finger leaves out a due date on it, as the list does. */
	day(): LocalDate;
	step(): number;
	timeline(): Timeline | null;
	targets(): readonly DropTarget[];
	readonly haptics: Haptics;
	readonly arbiter: GestureArbiter;
	/** A card is lifted or settled: the lists swap New task for the zones that put it off. */
	onDragging(active: boolean): void;
	onResult(drag: TaskDragPayload, result: PlacedResult): Promise<void>;
	/** A card dropped on Pick a date, back in its place: the date picker opens over it. */
	onPickDate(item: TaskItem, source: HTMLElement): void;
	/** A card dropped on New section, back in its place: the list asks for the section's name. */
	onNameGroup(item: TaskItem, asked: NameGroup): void;
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
			this.deps.onMenu(item, card);
		});
		new LongPress(card, {
			delayMs: () => this.deps.longPressMs(),
			busy: () => this.deps.arbiter.busy,
			onStart: (e) => this.begin(card, this.payload(card, item, from, e), e, subtree),
			onTap: () => this.deps.onMenu(item, card),
			onDoubleTap: () => this.deps.onRename(item),
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
			onTap: () => this.deps.onMenu(item, block),
			onDoubleTap: () => this.deps.onRename(item),
			onLongTap: () => this.selectWithMenu(block, item),
		});
	}

	private payload(card: HTMLElement, item: TaskItem, from: TaskOrigin, e: PointerEvent): TaskDragPayload {
		const onTimeline = from === "timeline" && item.slot;
		const durationMin = onTimeline && item.slot!.end !== null ? item.slot!.end - item.slot!.start : null;
		const rect = card.getBoundingClientRect();
		const grabPx = onTimeline ? e.clientY - rect.top : shownCardSize().height / 2;
		return { item, from, durationMin, grabPx, grabX: e.clientX - rect.left };
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

	private begin(source: HTMLElement, payload: TaskDragPayload, e: PointerEvent, subtree: readonly HTMLElement[] = []): void {
		if (!this.deps.arbiter.claim(DRAG)) return;
		this.deps.haptics.tap();
		const origin = source.getBoundingClientRect();
		const float = new FloatingCard(payload.item, { dx: e.clientX - origin.left, dy: e.clientY - origin.top }, this.deps.day());
		float.moveTo(e.clientX, e.clientY);
		const timeline = payload.from === "timeline" ? this.deps.timeline() : null;
		const lifted = [source, ...subtree];
		for (const card of lifted) card.classList.add("is-lifted");
		timeline?.layoutTasks();
		capturePointer(source, e.pointerId);
		this.deps.onDragging(true);
		/** A drop that asks first: the day on Pick a date, the name on New section. */
		let asking: { readonly kind: "pickDate" } | NameGroup | null = null;
		const reopen = () => {
			for (const card of lifted) card.classList.remove("is-lifted");
			timeline?.layoutTasks();
		};
		/** The card has come to rest. Over one dropped on Pick a date, back in its place by now, the picker opens; the screen is held until it does. */
		const settled = () => {
			this.deps.onDragging(false);
			if (!asking) return;
			this.deps.haptics.tap();
			if (asking.kind === "pickDate") {
				this.deps.onPickDate(payload.item, source);
				this.deps.arbiter.release(DRAG);
				return;
			}
			this.deps.arbiter.release(DRAG);
			this.deps.onNameGroup(payload.item, asking);
		};
		this.follow(
			source,
			e,
			(detach) =>
				new DragSession({
					payload,
					targets: this.deps.targets(),
					float,
					origin,
					onReturn: reopen,
					onEnd: async (result) => {
						detach();
						if (result?.kind === "pickDate" || result?.kind === "nameGroup") {
							asking = result;
							reopen();
							return;
						}
						this.deps.arbiter.release(DRAG);
						if (!result) return;
						this.deps.haptics.tap();
						await this.deps.onResult(payload, result);
					},
				}),
			settled,
		);
	}

	/**
	 * The plus taken: a "New task" card follows the finger over the same targets as a task, but no card is lifted and no
	 * zone appears. Let go off every target, or cancelled, the card flies back to `source` and `onDrop` hears null; let
	 * go on one, `onDrop` hears where once the card has landed. False when another gesture holds the screen: nothing starts.
	 */
	beginNew(source: HTMLElement, e: PointerEvent, targets: readonly DropTarget[], onDrop: (result: PlacedResult | null) => void): boolean {
		if (!this.deps.arbiter.claim(DRAG)) return false;
		this.deps.haptics.tap();
		const origin = source.getBoundingClientRect();
		const float = new FloatingCard(null, { dx: e.clientX - origin.left, dy: e.clientY - origin.top }, this.deps.day());
		float.moveTo(e.clientX, e.clientY);
		capturePointer(source, e.pointerId);
		const payload: NewTaskPayload = { from: "new", item: null, durationMin: null, grabPx: e.clientY - origin.top, grabX: e.clientX - origin.left };
		let placed: PlacedResult | null = null;
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
						placed = result && result.kind !== "pickDate" && result.kind !== "nameGroup" ? result : null;
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
		const up = (ev: PointerEvent) => {
			if (ev.pointerId === e.pointerId) void session.release(ev.clientX, ev.clientY).then(settled);
		};
		const cancel = (ev: PointerEvent) => {
			if (ev.pointerId === e.pointerId) void session.cancel().then(settled);
		};
		const detach = () => {
			document.removeEventListener("pointermove", move);
			document.removeEventListener("pointerup", up);
			document.removeEventListener("pointercancel", cancel);
			releasePointer(source, e.pointerId);
		};
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
