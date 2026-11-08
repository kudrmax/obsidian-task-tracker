import { type GroupedList, type GroupName, type GroupPlace, groupPlaceOf } from "../../../core/application/contracts";
import { DURATION } from "../design";
import { capturePointer, el, releasePointer } from "../dom";
import { Motion, timingOf } from "../motion/Motion";
import { DragSession } from "./DragSession";
import type { DropTarget, Float } from "./DropTarget";
import type { GestureArbiter } from "../gestures";
import type { Haptics } from "../haptics";
import type { ListGroup } from "../../../core/application/contracts";
import type { TaskList } from "../TaskList";
import { LongPress } from "./LongPress";

/** The lifted section's header and tasks fold away and the list closes over them. */
const FOLDED = "is-folded";

const DRAG = "drag";

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
		const rect = head.getBoundingClientRect();
		const float = new SectionFloat(head.ownerDocument, group.name ?? this.deps.ungroupedName(), group.items.length, { dx: e.clientX - rect.left, dy: e.clientY - rect.top });
		const plate = taskList.plateOf(group.name);
		const section = [head, ...taskList.cardsOf(group), ...(plate ? [plate] : [])];
		for (const node of section) node.classList.add(FOLDED);
		const slots = new SectionSlots(taskList, places, names, lifted);
		let released = false;
		const release = () => {
			if (released) return;
			released = true;
			this.deps.arbiter.release(DRAG);
		};
		const session = new DragSession<SectionPayload, GroupPlace>({
			payload: { section: group.name },
			targets: [slots],
			float,
			origin: () => head.getBoundingClientRect(),
			onReturn: () => {
				for (const node of section) {
					Motion.settle(node);
					node.classList.remove(FOLDED);
				}
			},
			/**
			 * The move is written and the list drawn as the file now has it, its landing place right after the section; the
			 * copy lands on the section's header as drawn there, found by the section's id. The screen stays the drag's
			 * until the copy has landed.
			 */
			onEnd: async (place) => {
				if (!place) return null;
				this.deps.haptics.tap();
				await this.deps.onMove(list, group.name, place).catch((error: unknown) => console.error("Task Calendar: section move", error));
				taskList.showLanding({ after: group.id });
				return taskList.headOf(group.id);
			},
		});
		session.move(e.clientX, e.clientY);
		capturePointer(head, e.pointerId);
		const doc = head.ownerDocument;
		const finish = (ev: PointerEvent, apply: boolean) => {
			if (ev.pointerId !== e.pointerId) return;
			doc.removeEventListener("pointermove", move);
			doc.removeEventListener("pointerup", up);
			doc.removeEventListener("pointercancel", cancel);
			releasePointer(head, e.pointerId);
			void (apply ? session.release(ev.clientX, ev.clientY) : session.cancel()).finally(release);
		};
		const move = (ev: PointerEvent) => {
			if (ev.pointerId === e.pointerId) session.move(ev.clientX, ev.clientY);
		};
		const up = (ev: PointerEvent) => finish(ev, true);
		const cancel = (ev: PointerEvent) => finish(ev, false);
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
}

/** What a lifted section carries: its name. */
interface SectionPayload {
	readonly section: GroupName;
}

/**
 * The slots between a list's sections, as one place to drop a lifted section: the slot nearest the finger shows as a
 * dashed place that opens there and closes behind it; let go, the move is the slot's place, none for the section's own.
 */
class SectionSlots implements DropTarget<SectionPayload, GroupPlace> {
	private nearest: number;
	/** The slot the mark was last put at: the finger moving within one slot leaves it be. */
	private marked: number | null = null;

	constructor(
		private readonly list: TaskList,
		private readonly places: readonly number[],
		private readonly names: readonly GroupName[],
		private readonly lifted: number,
	) {
		this.nearest = lifted;
	}

	hitTest(): boolean {
		return true;
	}

	/** The list draws the landing place over the slot's header, or takes it away on the section's own slot. */
	preview(_x: number, y: number): void {
		this.nearest = nearestSlot(this.places, y);
		if (this.nearest === this.marked) return;
		this.marked = this.nearest;
		this.list.showLanding(groupPlaceOf(this.names, this.lifted, this.nearest) === null ? null : { before: this.nearest });
	}

	drop(): GroupPlace | null {
		return groupPlaceOf(this.names, this.lifted, this.nearest);
	}

	/** A section lands on its own header, as drawn after the move. */
	landing(): DOMRect | null {
		return null;
	}

	leave(): void {}

	/** The drag is over: the landing place closes as the section opens. */
	clear(): void {
		this.marked = null;
		this.list.showLanding(null);
	}
}

/** The header under the finger, like a lifted card, its count on the right and two layers of its cards beneath. */
class SectionFloat implements Float {
	private readonly el: HTMLElement;

	constructor(
		doc: Document,
		name: string,
		count: number,
		private readonly grab: { readonly dx: number; readonly dy: number },
	) {
		this.el = el(doc.body, "div", "tc-section-float");
		el(this.el, "div", "tc-stack-layer is-2");
		el(this.el, "div", "tc-stack-layer is-1");
		const card = el(this.el, "div", "tc-section-card");
		el(card, "span", "tc-section-card-name", name);
		el(card, "span", "tc-section-card-count", String(count));
	}

	moveTo(x: number, y: number): void {
		this.el.style.transform = `translate3d(${x - this.grab.dx}px, ${y - this.grab.dy}px, 0)`;
	}

	/** Lands folding shut onto the place its section opens at: a line at the header's top as the section unfolds from it. */
	land(rect: DOMRect): Promise<void> {
		return this.animate([{ transform: this.el.style.transform }, { transform: `translate3d(${rect.left}px, ${rect.top}px, 0) scale(1, 0)` }]);
	}

	/** Flies to `rect`'s top left, as a dropped card's copy does. */
	flyTo(rect: DOMRect): Promise<void> {
		return this.animate([{ transform: this.el.style.transform }, { transform: `translate3d(${rect.left}px, ${rect.top}px, 0)` }]);
	}

	/** Flies to `rect`'s top left, fading as it goes. */
	sink(rect: DOMRect): Promise<void> {
		return this.animate([{ transform: this.el.style.transform, opacity: "1" }, { transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`, opacity: "0" }]);
	}

	vanish(): Promise<void> {
		return this.animate([{ opacity: "1" }, { opacity: "0" }]);
	}

	remove(): void {
		this.el.remove();
	}

	private animate(frames: Keyframe[]): Promise<void> {
		const timing = timingOf(this.el, DURATION.fly);
		if (!timing) return Promise.resolve();
		return this.el.animate(frames, { ...timing, fill: "forwards" }).finished.then(
			() => undefined,
			() => undefined,
		);
	}
}
