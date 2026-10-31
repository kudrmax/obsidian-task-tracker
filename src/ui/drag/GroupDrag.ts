import type { GroupedList, GroupName, GroupPlace } from "../../application/contracts";
import { capturePointer, el, releasePointer } from "../dom";
import type { GestureArbiter } from "../gestures";
import type { Haptics } from "../haptics";
import type { ListGroup } from "../listGroups";
import type { TaskList } from "../TaskList";
import { LongPress } from "./LongPress";

const DRAG = "drag";

/** Where a section let go at slot `slot` goes: before the group standing there, or last; null at its own place. */
export function liftedPlace(groups: readonly GroupName[], lifted: number, slot: number): GroupPlace | null {
	if (slot === lifted || slot === lifted + 1) return null;
	return slot >= groups.length ? "end" : { before: groups[slot] };
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

	attach(head: HTMLElement, list: GroupedList, taskList: TaskList, group: ListGroup): void {
		new LongPress(head, {
			delayMs: () => this.deps.longPressMs(),
			busy: () => this.deps.arbiter.busy,
			onStart: (e) => this.lift(head, list, taskList, group, e),
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
		const float = this.float(group);
		const cards = taskList.cards.filter((entry) => group.items.includes(entry.item)).map((entry) => entry.card);
		for (const node of [head, ...cards]) node.classList.add("is-lifted");
		const mark = el(null, "div", "tc-group-drop");
		let slot = lifted;
		const moveTo = (x: number, y: number) => {
			float.style.transform = `translate3d(${x - grab.dx}px, ${y - grab.dy}px, 0)`;
			slot = nearestSlot(places, y);
			if (liftedPlace(names, lifted, slot) === null) mark.remove();
			else if (slot < heads.length) heads[slot].before(mark);
			else taskList.el.appendChild(mark);
		};
		moveTo(e.clientX, e.clientY);
		capturePointer(head, e.pointerId);
		const finish = (ev: PointerEvent, apply: boolean) => {
			if (ev.pointerId !== e.pointerId) return;
			document.removeEventListener("pointermove", move);
			document.removeEventListener("pointerup", up);
			document.removeEventListener("pointercancel", cancel);
			releasePointer(head, e.pointerId);
			float.remove();
			mark.remove();
			for (const node of [head, ...cards]) node.classList.remove("is-lifted");
			this.deps.arbiter.release(DRAG);
			const place = apply ? liftedPlace(names, lifted, slot) : null;
			if (!place) return;
			this.deps.haptics.tap();
			void this.deps.onMove(list, group.name, place);
		};
		const move = (ev: PointerEvent) => {
			if (ev.pointerId === e.pointerId) moveTo(ev.clientX, ev.clientY);
		};
		const up = (ev: PointerEvent) => finish(ev, true);
		const cancel = (ev: PointerEvent) => finish(ev, false);
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerup", up);
		document.addEventListener("pointercancel", cancel);
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
	private float(group: ListGroup): HTMLElement {
		const stack = el(document.body, "div", "tc-section-float");
		el(stack, "div", "tc-stack-layer is-2");
		el(stack, "div", "tc-stack-layer is-1");
		const card = el(stack, "div", "tc-section-card");
		el(card, "span", "tc-section-card-name", group.name ?? this.deps.ungroupedName());
		el(card, "span", "tc-section-card-count", String(group.items.length));
		return stack;
	}
}
