import type { ResizeEdge, StretchSpan, TaskItem } from "../../application/contracts";
import { shownCardSize } from "../cardSize";
import { DESIGN, LAYOUT } from "../design";
import { pxToMinutes } from "../timelineLayout";
import { capturePointer, releasePointer } from "../dom";
import { Grips } from "../kit/Grips";
import type { GestureArbiter } from "../gestures";
import type { Haptics } from "../haptics";
import type { Timeline } from "../Timeline";
import type { TimelineDrop } from "./TimelineDrop";
import type { LocalDate, Slot } from "../types";
import { DragSession } from "./DragSession";
import type { DropResult, DropTarget, NewTaskPayload, TaskDragPayload, TaskOrigin } from "./DropTarget";
import { FloatingCard } from "./FloatingCard";
import { PlusFloat } from "./PlusFloat";
import { LongPress } from "./LongPress";
import { snapMinutes } from "./snap";
import type { PickedCard } from "../TaskSelection";

/** A lifted card stays where it stood as a dashed place, its subtasks folded away under it. */
const WAITING = "is-waiting";
const FOLDED = "is-folded";

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
	/** A list card tapped where `pressed` is: true when the tap folded or unfolded its subtasks, so its menu stays shut. */
	fold?(item: TaskItem, pressed: EventTarget | null): boolean;
	/** The other picked cards that go along when `item` is lifted; none when it is not picked or picked alone. */
	carried?(item: TaskItem): readonly PickedCard[];
	readonly haptics: Haptics;
	readonly arbiter: GestureArbiter;
	/** A card is lifted or settled: the plus hides while it is carried. */
	onDragging(active: boolean): void;
	/** Writes the drop and draws it: gives the dropped task's card as drawn now, null when none shows. */
	onResult(drag: TaskDragPayload, result: DropResult): Promise<HTMLElement | null>;
	/** The card of `item` while its `edge` dot is held at `minute` of the shown day. */
	stretch(item: TaskItem, edge: ResizeEdge, minute: number): StretchSpan;
	/** The `edge` dot let go at `minute`, a card being `minDurationMin` tall: true once the new time is written, false when nothing changes. */
	onResize(item: TaskItem, edge: ResizeEdge, minute: number, minDurationMin: number): Promise<boolean>;
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
const HOLD = "hold";
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
		/** Where the press began: the card captures the pointer, so the release names the card itself. */
		let pressed: EventTarget | null = null;
		card.addEventListener("pointerdown", (e) => (pressed = e.target));
		new LongPress(card, {
			delayMs: () => this.deps.longPressMs(),
			busy: () => this.deps.arbiter.busy,
			onStart: (e) => {
				const carried = this.deps.carried?.(item) ?? [];
				const payload = { ...this.payload(card, item, from, e), carried: carried.map((c) => ({ item: c.item, from: c.column })) };
				this.begin(card, payload, e, subtree, carried);
			},
			onTap: (e) => {
				if (this.deps.pick?.(item, card, e, "tap") || this.deps.fold?.(item, pressed)) return;
				this.tapped(e, item, this.deps.onMenu(item, card));
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
				if (e.pointerType !== "mouse" && this.holdFinger(block, e)) onMenu();
			},
			onTap: onMenu,
			onLongTap: onMenu,
		});
	}

	private payload(card: HTMLElement, item: TaskItem, from: TaskOrigin, e: PointerEvent): TaskDragPayload {
		const rect = card.getBoundingClientRect();
		const grabPx = from === "timeline" ? e.clientY - rect.top : shownCardSize().height / 2;
		return { item, from, grabPx };
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
		const held = this.holdFinger(block, e, (ev) => {
			menu.close();
			this.deps.timeline()?.select(null);
			if (this.deps.arbiter.pass(HOLD, DRAG)) this.lift(block, this.payload(block, item, "timeline", e), ev);
		});
		if (!held) return;
		this.deps.haptics.tap();
		const menu = this.selectWithMenu(block, item);
	}

	/**
	 * A long press that opened a menu keeps its finger until it lifts: the screen is the finger's, so neither a swipe
	 * nor a scroll takes it under the menu. `moveOn` hears the finger leave its place, and the screen is then its to pass on.
	 */
	private holdFinger(source: HTMLElement, e: PointerEvent, moveOn?: (ev: PointerEvent) => void): boolean {
		if (!this.deps.arbiter.claim(HOLD)) return false;
		capturePointer(source, e.pointerId);
		const detach = () => {
			lost();
			document.removeEventListener("pointermove", move);
			document.removeEventListener("pointerup", end);
			document.removeEventListener("pointercancel", end);
			releasePointer(source, e.pointerId);
		};
		const move = (ev: PointerEvent) => {
			if (!moveOn || ev.pointerId !== e.pointerId || Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) <= LAYOUT.pressTolerance) return;
			detach();
			moveOn(ev);
			this.deps.arbiter.release(HOLD);
		};
		const end = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			detach();
			this.deps.arbiter.release(HOLD);
		};
		const lost = onLostLift(e.pointerId, () => end(e));
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerup", end);
		document.addEventListener("pointercancel", end);
		return true;
	}

	/** The dots on the copy of the card over the menu's blur stretch the card itself; a dot taken closes the menu. */
	private gripsOn(copy: HTMLElement, block: HTMLElement, item: TaskItem, closeMenu: () => void): void {
		Grips.attach(copy, {
			takes: () => !this.deps.arbiter.busy,
			onGrip: (edge, e) => {
				closeMenu();
				this.beginResize(block, item, edge, e);
			},
		});
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
			lost();
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
		const lost = onLostLift(e.pointerId, () => finish(e, false));
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerup", up);
		document.addEventListener("pointercancel", cancel);
	}

	/** `carried`: the other picked cards, lifted with this one; each waits as a dashed place where it stood. */
	private begin(source: HTMLElement, payload: TaskDragPayload, e: PointerEvent, subtree: readonly HTMLElement[] = [], carried: readonly PickedCard[] = []): void {
		if (this.deps.arbiter.claim(DRAG)) this.lift(source, payload, e, subtree, carried);
	}

	/** The card leaves its place and follows the finger; the screen is already the drag's. */
	private lift(source: HTMLElement, payload: TaskDragPayload, e: PointerEvent, subtree: readonly HTMLElement[] = [], carried: readonly PickedCard[] = []): void {
		this.deps.haptics.tap();
		const origin = source.getBoundingClientRect();
		const float = new FloatingCard(payload.item, { dx: e.clientX - origin.left, dy: e.clientY - origin.top }, this.deps.day(), 1 + carried.length);
		float.moveTo(e.clientX, e.clientY);
		const timeline = payload.from === "timeline" ? this.deps.timeline() : null;
		const waiting = [source, ...carried.map((c) => c.card)];
		const folded = [...subtree, ...carried.flatMap((c) => c.subtree)];
		const lifted = [...waiting, ...folded];
		for (const card of lifted) card.classList.add("is-lifted");
		for (const card of waiting) card.classList.add(WAITING);
		for (const card of folded) card.classList.add(FOLDED);
		timeline?.layoutTasks();
		capturePointer(source, e.pointerId);
		this.deps.onDragging(true);
		const reopen = () => {
			for (const card of lifted) card.classList.remove("is-lifted", WAITING, FOLDED);
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
						if (!result) return null;
						this.deps.haptics.tap();
						const card = await this.deps.onResult(payload, result);
						reopen();
						return card;
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
		const payload: NewTaskPayload = { from: "new", item: null, grabPx: e.clientY - origin.top };
		let placed = false;
		this.follow(
			source,
			e,
			(detach) =>
				new DragSession({
					payload,
					targets,
					float,
					origin,
					// Placed, the task opens as the finger lifts, its line giving way to the field; the plus shrinks meanwhile.
					onEnd: async (result) => {
						detach();
						if (!result) return;
						placed = true;
						this.deps.arbiter.release(DRAG);
						for (const target of targets) target.clear();
						this.deps.haptics.tap();
						onDrop(result);
					},
				}),
			() => {
				if (placed) return;
				this.deps.arbiter.release(DRAG);
				onDrop(null);
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
		const lost = onLostLift(e.pointerId, () => end(() => session.cancel()));
		const detach = () => {
			lost();
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
	 * A dot moves one edge by a grid step at a time and the stack follows; where it may go and what letting go writes is
	 * the service's (see `TaskService.stretch` and `resize`).
	 */
	private beginResize(block: HTMLElement, item: TaskItem, edge: ResizeEdge, e: PointerEvent): void {
		const timeline = this.deps.timeline();
		if (!timeline || !item.slot || !this.deps.arbiter.claim(RESIZE)) return;
		const shown = timeline.shownSpan(item);
		this.deps.haptics.tap();
		capturePointer(block, e.pointerId);
		const step = this.deps.step();
		let minute = edge === "end" ? (shown.end ?? shown.start) : shown.start;
		/** The span last shown: the stack is laid out again only when a grid step changes it. */
		let span = this.deps.stretch(item, edge, minute);
		const move = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			minute = snapMinutes(timeline.minutesAt(ev.clientY), step);
			const next = this.deps.stretch(item, edge, minute);
			if (next.start === span.start && next.end === span.end) return;
			span = next;
			timeline.stretchTo(block, span, edge);
		};
		/** The screen stays held until the write is done: a second grab of the card, or another gesture, would start from its old time. */
		const finish = async (ev: PointerEvent, apply: boolean) => {
			if (ev.pointerId !== e.pointerId) return;
			document.removeEventListener("pointermove", move);
			document.removeEventListener("pointerup", up);
			document.removeEventListener("pointercancel", cancel);
			releasePointer(block, e.pointerId);
			let unchanged = false;
			try {
				if (apply && (await this.deps.onResize(item, edge, minute, pxToMinutes(shownCardSize().height + DESIGN.itemGap, timeline.hourPx)))) this.deps.haptics.tap();
				else {
					unchanged = true;
					timeline.stretchTo(block, null, edge);
				}
			} finally {
				if (!unchanged) timeline.endStretch(item.key);
				this.deps.arbiter.release(RESIZE);
			}
		};
		const report = (error: unknown) => console.error("Task Calendar: resize", error);
		const up = (ev: PointerEvent) => void finish(ev, true).catch(report);
		const cancel = (ev: PointerEvent) => void finish(ev, false).catch(report);
		timeline.stretchTo(block, span, edge);
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerup", up);
		document.addEventListener("pointercancel", cancel);
	}

}

/**
 * iOS sends a finger's lift to the element it touched, and a redraw (a pinch's new hour lines) may have taken that element
 * away: a finger that comes down alone proves the held one gone, and `lost` ends what it held. Returns the unsubscribe.
 */
function onLostLift(pointerId: number, lost: () => void): () => void {
	const down = (ev: PointerEvent) => {
		if (ev.isPrimary && ev.pointerId !== pointerId) lost();
	};
	document.addEventListener("pointerdown", down, true);
	return () => document.removeEventListener("pointerdown", down, true);
}
