import type { TaskItem } from "../../application/contracts";
import { LAYOUT, PROPERTY } from "../design";
import { capturePointer, px, releasePointer } from "../dom";
import type { GestureArbiter } from "../gestures";
import type { Haptics } from "../haptics";
import type { Timeline } from "../Timeline";
import type { TimelineDrop } from "./TimelineDrop";
import type { LocalDate, Slot } from "../types";
import { DragSession } from "./DragSession";
import type { DragOrigin, DragPayload, DropResult, DropTarget } from "./DropTarget";
import { FloatingCard } from "./FloatingCard";
import { LongPress } from "./LongPress";
import { snapMinutes } from "./snap";

export interface DragControllerDeps {
	longPressMs(): number;
	newTaskMinutes(): number;
	step(): number;
	date(): LocalDate;
	timeline(): Timeline | null;
	targets(): readonly DropTarget[];
	readonly haptics: Haptics;
	readonly arbiter: GestureArbiter;
	onResult(drag: DragPayload, result: DropResult): Promise<void>;
	onResize(item: TaskItem, end: number): Promise<void>;
	onMenu(item: TaskItem, source: HTMLElement, at: { x: number; y: number }): void;
	/** A long tap on an empty place of the timeline, let go: a new task in the slot the target showed. */
	newSlot(): TimelineDrop | null;
	onNewSlot(slot: Slot): void;
}

const DRAG = "drag";
const RESIZE = "resize";
const NEW_SLOT = "newslot";

/**
 * Gives a card or a block its gestures: the long press that lifts it, the drag that follows, the handle that resizes a
 * block, the menu. While a gesture owns the screen the view keeps the browser from scrolling (see the arbiter).
 */
export class DragController {
	constructor(private readonly deps: DragControllerDeps) {}

	attachCard(card: HTMLElement, item: TaskItem, from: DragOrigin): void {
		this.attachMenu(card, item);
		new LongPress(card, {
			delayMs: () => this.deps.longPressMs(),
			busy: () => this.deps.arbiter.busy,
			onStart: (e) => this.begin(card, this.payload(item, from, e), e),
			onLongTap: (e) => this.deps.onMenu(item, card, { x: e.clientX, y: e.clientY }),
		});
	}

	attachBlock(block: HTMLElement, item: TaskItem): void {
		this.attachCard(block, item, "timeline");
		const handle = block.querySelector<HTMLElement>(".tc-resize-hit");
		if (!handle) return;
		handle.addEventListener("pointerdown", (e) => e.stopPropagation());
		new LongPress(handle, {
			delayMs: () => this.deps.longPressMs(),
			busy: () => this.deps.arbiter.busy,
			onStart: (e) => this.beginResize(block, handle, item, e),
		});
	}

	private payload(item: TaskItem, from: DragOrigin, e: PointerEvent): DragPayload {
		const durationMin = item.slot ? item.slot.end - item.slot.start : this.deps.newTaskMinutes();
		const timeline = this.deps.timeline();
		const anchorMin = from === "timeline" && item.slot && timeline ? timeline.minutesAt(e.clientY) - item.slot.start : durationMin / 2;
		return { item, from, durationMin, anchorMin };
	}

	/** The timeline's empty places: a long tap shows the target for a new task, moving slides it, lifting opens the task screen. */
	attachCanvas(canvas: HTMLElement): void {
		const onEmpty = (e: PointerEvent) => {
			const target = e.target as Element | null;
			if (target?.closest(".tc-block, .tc-event, .tc-drop")) return;
			this.beginNewSlot(canvas, e);
		};
		new LongPress(canvas, {
			delayMs: () => this.deps.longPressMs(),
			busy: () => this.deps.arbiter.busy,
			onStart: onEmpty,
			onLongTap: onEmpty,
		});
	}

	private beginNewSlot(canvas: HTMLElement, e: PointerEvent): void {
		const drop = this.deps.newSlot();
		if (!drop || !this.deps.arbiter.claim(NEW_SLOT)) return;
		this.deps.haptics.tap();
		drop.previewNew(e.clientY, this.deps.newTaskMinutes());
		capturePointer(canvas, e.pointerId);
		const move = (ev: PointerEvent) => {
			if (ev.pointerId === e.pointerId) drop.previewNew(ev.clientY, this.deps.newTaskMinutes());
		};
		const finish = (ev: PointerEvent, open: boolean) => {
			if (ev.pointerId !== e.pointerId) return;
			canvas.removeEventListener("pointermove", move);
			canvas.removeEventListener("pointerup", up);
			canvas.removeEventListener("pointercancel", cancel);
			releasePointer(canvas, e.pointerId);
			this.deps.arbiter.release(NEW_SLOT);
			if (open) this.deps.onNewSlot({ date: this.deps.date(), ...drop.slot });
			else drop.clear();
		};
		const up = (ev: PointerEvent) => finish(ev, true);
		const cancel = (ev: PointerEvent) => finish(ev, false);
		canvas.addEventListener("pointermove", move);
		canvas.addEventListener("pointerup", up);
		canvas.addEventListener("pointercancel", cancel);
	}

	private attachMenu(el: HTMLElement, item: TaskItem): void {
		el.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.deps.onMenu(item, el, { x: e.clientX, y: e.clientY });
		});
	}

	private begin(source: HTMLElement, payload: DragPayload, e: PointerEvent): void {
		if (!this.deps.arbiter.claim(DRAG)) return;
		this.deps.haptics.tap();
		const origin = source.getBoundingClientRect();
		const float = new FloatingCard(payload.item, { dx: e.clientX - origin.left, dy: e.clientY - origin.top });
		float.moveTo(e.clientX, e.clientY);
		source.classList.add("is-lifted");
		capturePointer(source, e.pointerId);
		const session = new DragSession({
			payload,
			targets: this.deps.targets(),
			float,
			origin,
			onReturn: () => source.classList.remove("is-lifted"),
			onEnd: async (result, moved) => {
				detach();
				this.deps.arbiter.release(DRAG);
				if (result) {
					this.deps.haptics.tap();
					await this.deps.onResult(payload, result);
				} else if (!moved) this.deps.onMenu(payload.item, source, { x: e.clientX, y: e.clientY });
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
			source.removeEventListener("pointermove", move);
			source.removeEventListener("pointerup", up);
			source.removeEventListener("pointercancel", cancel);
			releasePointer(source, e.pointerId);
		};
		source.addEventListener("pointermove", move);
		source.addEventListener("pointerup", up);
		source.addEventListener("pointercancel", cancel);
	}

	private beginResize(block: HTMLElement, handle: HTMLElement, item: TaskItem, e: PointerEvent): void {
		const timeline = this.deps.timeline();
		const slot = item.slot;
		if (!timeline || !slot || !this.deps.arbiter.claim(RESIZE)) return;
		this.deps.haptics.tap();
		block.classList.add("is-resizing");
		capturePointer(handle, e.pointerId);
		let end = slot.end;
		const place = () => {
			block.style.setProperty(PROPERTY.length, px(timeline.yOf(end) - timeline.yOf(slot.start)));
			block.classList.toggle("is-tiny", timeline.yOf(end) - timeline.yOf(slot.start) < LAYOUT.tinyItemHeight);
		};
		const move = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			const step = this.deps.step();
			end = Math.min(LAYOUT.minutesPerDay, Math.max(slot.start + step, snapMinutes(timeline.minutesAt(ev.clientY), step)));
			place();
		};
		const finish = async (ev: PointerEvent, apply: boolean) => {
			if (ev.pointerId !== e.pointerId) return;
			handle.removeEventListener("pointermove", move);
			handle.removeEventListener("pointerup", up);
			handle.removeEventListener("pointercancel", cancel);
			releasePointer(handle, e.pointerId);
			this.deps.arbiter.release(RESIZE);
			block.classList.remove("is-resizing");
			if (apply && end !== slot.end) {
				this.deps.haptics.tap();
				await this.deps.onResize(item, end);
			} else {
				end = slot.end;
				place();
			}
		};
		const up = (ev: PointerEvent) => void finish(ev, true);
		const cancel = (ev: PointerEvent) => void finish(ev, false);
		handle.addEventListener("pointermove", move);
		handle.addEventListener("pointerup", up);
		handle.addEventListener("pointercancel", cancel);
	}
}
