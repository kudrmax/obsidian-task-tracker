import type { TaskItem } from "../../application/contracts";
import { DESIGN, LAYOUT } from "../design";
import { stretchedSpan } from "../timelineLayout";
import { capturePointer, el, releasePointer } from "../dom";
import type { GestureArbiter } from "../gestures";
import type { Haptics } from "../haptics";
import type { ResizeEdge, Timeline } from "../Timeline";
import type { TimelineDrop } from "./TimelineDrop";
import type { Slot } from "../types";
import { DragSession } from "./DragSession";
import type { DragOrigin, DragPayload, DropResult, DropTarget } from "./DropTarget";
import { FloatingCard } from "./FloatingCard";
import { LongPress } from "./LongPress";
import { snapMinutes } from "./snap";

export interface DragControllerDeps {
	longPressMs(): number;
	step(): number;
	timeline(): Timeline | null;
	targets(): readonly DropTarget[];
	readonly haptics: Haptics;
	readonly arbiter: GestureArbiter;
	onResult(drag: DragPayload, result: DropResult): Promise<void>;
	onResize(item: TaskItem, slot: Slot): Promise<void>;
	/** Opens the task menu over `source`; `lifted` dresses the copy of the card that stays over the blur. */
	onMenu(item: TaskItem, source: HTMLElement, lifted?: (copy: HTMLElement, close: () => void) => void): OpenMenu;
	/** A long tap on an empty place of the timeline, let go: a new task in the slot the target showed. */
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
 * Gives a card its gestures: the tap that opens its menu, the long press that lifts it, the drag that follows. A card on
 * the timeline answers a long press like Apple Calendar: it is selected, its menu opens, and moving the finger on from
 * there drags it; the dots of a selected card stretch it. While a gesture owns the screen the view keeps the browser from
 * scrolling (see the arbiter).
 */
export class DragController {
	constructor(private readonly deps: DragControllerDeps) {}

	attachCard(card: HTMLElement, item: TaskItem, from: DragOrigin): void {
		card.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.deps.onMenu(item, card);
		});
		new LongPress(card, {
			delayMs: () => this.deps.longPressMs(),
			busy: () => this.deps.arbiter.busy,
			onStart: (e) => this.begin(card, this.payload(card, item, from, e), e),
			onTap: () => this.deps.onMenu(item, card),
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
			onLongTap: () => this.selectWithMenu(block, item),
		});
	}

	private payload(card: HTMLElement, item: TaskItem, from: DragOrigin, e: PointerEvent): DragPayload {
		const onTimeline = from === "timeline" && item.slot;
		const durationMin = onTimeline && item.slot!.end !== null ? item.slot!.end - item.slot!.start : null;
		const grabPx = onTimeline ? e.clientY - card.getBoundingClientRect().top : DESIGN.cardHeight / 2;
		return { item, from, durationMin, grabPx };
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

	/** The timeline's empty places: a long tap shows the target for a new task, moving slides it, lifting opens the task screen. */
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
			if (open) this.deps.onNewSlot(drop.slot);
			else drop.clear();
		};
		const up = (ev: PointerEvent) => finish(ev, true);
		const cancel = (ev: PointerEvent) => finish(ev, false);
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerup", up);
		document.addEventListener("pointercancel", cancel);
	}

	private begin(source: HTMLElement, payload: DragPayload, e: PointerEvent): void {
		if (!this.deps.arbiter.claim(DRAG)) return;
		this.deps.haptics.tap();
		const origin = source.getBoundingClientRect();
		const float = new FloatingCard(payload.item, { dx: e.clientX - origin.left, dy: e.clientY - origin.top });
		float.moveTo(e.clientX, e.clientY);
		const timeline = payload.from === "timeline" ? this.deps.timeline() : null;
		source.classList.add("is-lifted");
		timeline?.layoutTasks();
		capturePointer(source, e.pointerId);
		const session = new DragSession({
			payload,
			targets: this.deps.targets(),
			float,
			origin,
			onReturn: () => {
				source.classList.remove("is-lifted");
				timeline?.layoutTasks();
			},
			onEnd: async (result) => {
				detach();
				this.deps.arbiter.release(DRAG);
				if (!result) return;
				this.deps.haptics.tap();
				await this.deps.onResult(payload, result);
			},
		});
		const move = (ev: PointerEvent) => {
			if (ev.pointerId === e.pointerId) session.move(ev.clientX, ev.clientY);
		};
		const up = (ev: PointerEvent) => {
			if (ev.pointerId === e.pointerId) void session.release(ev.clientX, ev.clientY);
		};
		const cancel = (ev: PointerEvent) => {
			if (ev.pointerId === e.pointerId) void session.cancel();
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
		const slot = timeline.spanOf(item.slot);
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
			const next = stretchedSpan(slot, { start, end }, edge, timeline.hourPx);
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
