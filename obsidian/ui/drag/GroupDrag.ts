import { type GroupedList, type GroupName, type GroupPlace, groupPlaceOf } from "../../../core/application/contracts";
import { DURATION } from "../design";
import { capturePointer, el, releasePointer } from "../dom";
import { Motion, timingOf } from "../motion/Motion";
import type { GestureArbiter } from "../gestures";
import type { Haptics } from "../haptics";
import type { ListGroup } from "../../../core/application/contracts";
import type { TaskList } from "../TaskList";
import { LongPress } from "./LongPress";

/** The lifted section's header and tasks fold away and the list closes over them. */
const FOLDED = "is-folded";

const DRAG = "drag";

/** The lifted section's copy flies to `rect` and settles there, as a dropped card's does. */
function flyTo(float: HTMLElement, rect: DOMRect): Promise<void> {
	const timing = timingOf(float, DURATION.fly);
	const to = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
	if (!timing) {
		float.style.transform = to;
		return Promise.resolve();
	}
	const flight = float.animate([{ transform: float.style.transform }, { transform: to }], { ...timing, fill: "forwards" });
	return flight.finished.then(
		() => undefined,
		() => undefined,
	);
}

/** The slot whose place on screen is nearest the finger. */
export function nearestSlot(places: readonly number[], y: number): number {
	let best = 0;
	places.forEach((place, i) => {
		if (Math.abs(place - y) < Math.abs(places[best] - y)) best = i;
	});
	return best;
}

export interface GroupDragDeps {
	longPressMs(): number;
	readonly arbiter: GestureArbiter;
	readonly haptics: Haptics;
	ungroupedName(): string;
	/** A tap on a header. */
	onTap(head: HTMLElement, list: GroupedList, group: ListGroup): void;
	onMove(list: GroupedList, group: GroupName, place: GroupPlace): Promise<void>;
}

/**
 * A section's header: a tap is the section's menu, a long press lifts the whole section (sections spec §5.4). Its cards
 * hide under the header, the list closes up, the header follows the finger over a stack of its cards, and a gap between
 * the sections shows where it lands.
 */
export class GroupDrag {
	constructor(private readonly deps: GroupDragDeps) {}

	attach(head: HTMLElement, list: GroupedList, taskList: TaskList, group: ListGroup, signal?: AbortSignal): void {
		new LongPress(head, {
			signal,
			delayMs: () => this.deps.longPressMs(),
			busy: () => this.deps.arbiter.busy,
			onStart: (e) => {
				if (group.reorder) this.lift(head, list, taskList, group, e);
			},
			onTap: () => this.deps.onTap(head, list, group),
		});
	}

	private lift(head: HTMLElement, list: GroupedList, taskList: TaskList, group: ListGroup, e: PointerEvent): void {
		if (!this.deps.arbiter.claim(DRAG)) return;
		this.deps.haptics.tap();
		const names = taskList.groups.map((g) => g.name);
		const lifted = names.indexOf(group.name);
		const heads = taskList.elements.filter((node) => node.classList.contains("tc-group-head"));
		const places = this.places(heads, taskList, lifted);
		const grab = { dx: e.clientX - head.getBoundingClientRect().left, dy: e.clientY - head.getBoundingClientRect().top };
		const float = this.float(head.ownerDocument, group);
		const plate = taskList.plateOf(group.name);
		const cards = [...taskList.cardsOf(group), ...(plate ? [plate] : [])];
		for (const node of [head, ...cards]) node.classList.add(FOLDED);
		/** Where the section lands: a dashed place that opens between the sections as the finger comes, and closes behind it. */
		let mark: HTMLElement | null = null;
		let slot = lifted;
		/** The slot the mark was last put at: the finger moving within one slot leaves it be. */
		let marked: number | null = null;
		const moveTo = (x: number, y: number) => {
			float.style.transform = `translate3d(${x - grab.dx}px, ${y - grab.dy}px, 0)`;
			slot = nearestSlot(places, y);
			if (slot === marked) return;
			marked = slot;
			if (mark) Motion.leave(mark, () => undefined, false);
			mark = null;
			if (groupPlaceOf(names, lifted, slot) === null) return;
			mark = el(null, "div", "tc-group-drop");
			if (slot < heads.length) heads[slot].before(mark);
			else taskList.el.appendChild(mark);
			Motion.enter(mark);
		};
		moveTo(e.clientX, e.clientY);
		capturePointer(head, e.pointerId);
		const doc = head.ownerDocument;
		/**
		 * The section lands as a task does: the copy flies to its place (the mark, or back where it was lifted), the move is
		 * written and drawn, and only then does the section open there as the mark closes, one giving the other its room.
		 */
		const finish = async (ev: PointerEvent, apply: boolean) => {
			if (ev.pointerId !== e.pointerId) return;
			doc.removeEventListener("pointermove", move);
			doc.removeEventListener("pointerup", up);
			doc.removeEventListener("pointercancel", cancel);
			releasePointer(head, e.pointerId);
			const place = apply ? groupPlaceOf(names, lifted, slot) : null;
			const landing = place && mark ? mark : head;
			await flyTo(float, landing.getBoundingClientRect());
			if (place) {
				this.deps.haptics.tap();
				await this.deps.onMove(list, group.name, place).catch((error: unknown) => console.error("Task Calendar: section move", error));
			}
			this.deps.arbiter.release(DRAG);
			float.remove();
			if (mark) Motion.leave(mark, () => undefined, false);
			for (const node of [head, ...cards]) {
				Motion.settle(node);
				node.classList.remove(FOLDED);
			}
		};
		const move = (ev: PointerEvent) => {
			if (ev.pointerId === e.pointerId) moveTo(ev.clientX, ev.clientY);
		};
		const up = (ev: PointerEvent) => void finish(ev, true);
		const cancel = (ev: PointerEvent) => void finish(ev, false);
		doc.addEventListener("pointermove", move);
		doc.addEventListener("pointerup", up);
		doc.addEventListener("pointercancel", cancel);
	}

	/** Each slot's place: the top of the header it goes before, or the list's end; below the lifted section, as if it were gone. */
	private places(heads: readonly HTMLElement[], taskList: TaskList, lifted: number): number[] {
		const tops = heads.map((h) => h.getBoundingClientRect().top);
		const nodes = taskList.elements;
		const end = nodes.length > 0 ? nodes[nodes.length - 1].getBoundingClientRect().bottom : taskList.el.getBoundingClientRect().top;
		const all = [...tops, end];
		const height = all[lifted + 1] - all[lifted];
		return all.map((top, i) => (i > lifted ? top - height : top));
	}

	/** The header under the finger, like a lifted card, its count on the right and two layers of its cards beneath. */
	private float(doc: Document, group: ListGroup): HTMLElement {
		const stack = el(doc.body, "div", "tc-section-float");
		el(stack, "div", "tc-stack-layer is-2");
		el(stack, "div", "tc-stack-layer is-1");
		const card = el(stack, "div", "tc-section-card");
		el(card, "span", "tc-section-card-name", group.name ?? this.deps.ungroupedName());
		el(card, "span", "tc-section-card-count", String(group.items.length));
		return stack;
	}
}
