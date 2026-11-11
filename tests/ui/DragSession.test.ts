// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { TaskItem } from "../../core/application/contracts";
import { DragSession, type DragPayload, type DropResult, type DropTarget, type Float, type HeldOut, type NewTaskPayload } from "../../obsidian/ui/drag/DragSession";
import { onDay } from "../fakes/itemOnDay";

const item: TaskItem = onDay({ key: { section: "now", index: 1, path: [], raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: "now", isSubtask: false }, "2026-11-01");
const payload: DragPayload = { item, from: "day", grabPx: 20 };
const rect = (x: number, y: number) => ({ x, y, width: 100, height: 40, top: y, left: x, right: x + 100, bottom: y + 40, toJSON: () => "" }) as DOMRect;

class FakeTarget implements DropTarget {
	readonly log: string[] = [];
	constructor(private readonly name: string, private readonly from: number, private readonly to: number, private readonly result: DropResult | null) {}
	hitTest(x: number): boolean {
		return x >= this.from && x < this.to;
	}
	preview(x: number, y: number): void {
		this.log.push(`preview ${x},${y}`);
	}
	landing(): DOMRect {
		return rect(this.from, 0);
	}
	leave(): void {
		this.log.push("leave");
	}
	clear(): void {
		this.log.push("clear");
	}
	drop(): DropResult | null {
		this.log.push("drop");
		return this.result;
	}
	toString(): string {
		return this.name;
	}
}

class FakeFloat implements Float {
	readonly log: string[] = [];
	moveTo(x: number, y: number): void {
		this.log.push(`move ${x},${y}`);
	}
	async land(to: DOMRect): Promise<void> {
		this.log.push(`land ${to.x},${to.y}`);
	}
	async flyTo(to: DOMRect): Promise<void> {
		this.log.push(`fly ${to.x},${to.y}`);
	}
	async sink(to: DOMRect): Promise<void> {
		this.log.push(`sink ${to.x},${to.y}`);
	}
	async vanish(): Promise<void> {
		this.log.push("vanish");
	}
	remove(): void {
		this.log.push("remove");
	}
}

function session(targets: DropTarget[], float: FakeFloat, ended: unknown[], carried: DragPayload = payload, drawn: HTMLElement | HeldOut | null = null) {
	return new DragSession({
		payload: carried,
		targets,
		float,
		landsOnTarget: carried.from === "new",
		origin: () => rect(5, 500),
		onEnd: async (result) => {
			ended.push(result);
			return drawn;
		},
	});
}

/** A card drawn after the drop, standing at `top`. */
function drawnCard(top: number): HTMLElement {
	const card = document.createElement("div");
	card.getBoundingClientRect = () => rect(30, top);
	return card;
}

describe("DragSession", () => {
	it("moves the float and previews on the target under the pointer, letting the one left go on", () => {
		const a = new FakeTarget("a", 0, 100, { kind: "clearSlot" });
		const b = new FakeTarget("b", 100, 200, { kind: "clearSlot" });
		const float = new FakeFloat();
		const s = session([a, b], float, []);
		s.move(50, 10);
		s.move(150, 20);
		s.move(250, 30);
		expect(float.log).toEqual(["move 50,10", "move 150,20", "move 250,30"]);
		expect(a.log).toEqual(["preview 50,10", "leave"]);
		expect(b.log).toEqual(["preview 150,20", "leave"]);
	});

	it("reads the targets before it moves the float", () => {
		const journal: string[] = [];
		const target = new FakeTarget("a", 0, 100, null);
		target.hitTest = () => (journal.push("hit"), true);
		target.preview = () => void journal.push("preview");
		const float = new FakeFloat();
		float.moveTo = () => void journal.push("float");
		const s = session([target], float, []);
		s.move(10, 10);
		s.move(20, 20);
		expect(journal).toEqual(["hit", "preview", "float", "hit", "preview", "float"]);
	});

	it("drops on the target, reports the result and lands on the task's card as drawn after it, never on the target's guess", async () => {
		const slot: DropResult = { kind: "time", start: 990 };
		const a = new FakeTarget("a", 0, 100, slot);
		const float = new FakeFloat();
		const ended: unknown[] = [];
		const s = session([a], float, ended, payload, drawnCard(240));
		s.move(50, 10);
		await s.release(50, 10);
		expect(a.log).toEqual(["preview 50,10", "drop", "clear"]);
		expect(float.log).toEqual(["move 50,10", "land 30,240", "remove"]);
		expect(ended).toEqual([slot]);
	});

	it("goes into the header of the folded group its task went into, as no card of it is drawn", async () => {
		const a = new FakeTarget("a", 0, 100, { kind: "clearSlot" });
		const float = new FakeFloat();
		const s = session([a], float, [], payload, { behind: drawnCard(120) });
		s.move(50, 10);
		await s.release(50, 10);
		expect(float.log).toEqual(["move 50,10", "sink 30,120", "remove"]);
	});

	it("frees the screen as the finger lets go, before the drop is written or the copy flies", async () => {
		const order: string[] = [];
		const float = new FakeFloat();
		float.land = async () => void order.push("land");
		const s = new DragSession({
			payload,
			targets: [new FakeTarget("a", 0, 100, { kind: "clearSlot" })],
			float,
			origin: () => rect(5, 500),
			letGo: () => order.push("free"),
			onEnd: async () => {
				order.push("written");
				return drawnCard(0);
			},
		});
		s.move(50, 10);
		await s.release(50, 10);
		expect(order).toEqual(["free", "written", "land"]);
	});

	it("frees the screen at once when cancelled, while the copy still flies back", async () => {
		const order: string[] = [];
		const float = new FakeFloat();
		float.flyTo = async () => void order.push("fly");
		const s = new DragSession({ payload, targets: [], float, origin: () => rect(5, 500), letGo: () => order.push("free"), onEnd: async () => {} });
		await s.cancel();
		expect(order).toEqual(["free", "fly"]);
	});

	it("a new drag taken while a copy still lands gives the old one's place back now; only the copy of the task taken again goes", async () => {
		const order: string[] = [];
		let landing!: () => void;
		const flying = (name: string) => {
			const float = new FakeFloat();
			float.land = () => new Promise<void>((done) => (landing = done));
			float.remove = () => void order.push(`remove ${name}`);
			return float;
		};
		const target = new FakeTarget("a", 0, 100, { kind: "clearSlot" });
		target.clear = () => void order.push("clear");
		const make = (name: string, carries: string) =>
			new DragSession({ payload, targets: [target], float: flying(name), carries, origin: () => rect(5, 500), onReturn: () => order.push(`return ${name}`), onEnd: async () => drawnCard(0) });
		const first = make("first", "t1");
		first.move(50, 10);
		const released = first.release(50, 10);
		await Promise.resolve();
		await Promise.resolve();
		DragSession.landNow("t2");
		expect(order).toEqual(["return first", "clear"]);
		expect(first.interrupted).toBe(true);
		DragSession.landNow("t1");
		expect(order).toEqual(["return first", "clear"]);
		landing();
		await released;
		expect(order).toEqual(["return first", "clear", "remove first"]);
	});

	it("the copy of the task taken again before it lands goes at once", async () => {
		const order: string[] = [];
		const float = new FakeFloat();
		float.land = () => new Promise<void>(() => undefined);
		float.remove = () => void order.push("remove");
		const s = new DragSession({ payload, targets: [new FakeTarget("a", 0, 100, { kind: "clearSlot" })], float, carries: "t1", origin: () => rect(5, 500), onReturn: () => order.push("return"), onEnd: async () => drawnCard(0) });
		s.move(50, 10);
		void s.release(50, 10);
		await Promise.resolve();
		await Promise.resolve();
		DragSession.landNow("t1");
		expect(order).toEqual(["return", "remove"]);
	});

	it("lands only once the drop is written and drawn", async () => {
		const order: string[] = [];
		const float = new FakeFloat();
		float.land = async () => void order.push("land");
		const s = new DragSession({
			payload,
			targets: [new FakeTarget("a", 0, 100, { kind: "clearSlot" })],
			float,
			origin: () => rect(5, 500),
			onEnd: async () => {
				await Promise.resolve();
				order.push("written");
				return drawnCard(0);
			},
		});
		s.move(50, 10);
		await s.release(50, 10);
		expect(order).toEqual(["written", "land"]);
	});

	it("a task whose card does not show after the drop fades where it was let go", async () => {
		const float = new FakeFloat();
		const s = session([new FakeTarget("a", 0, 100, { kind: "clearSlot" })], float, []);
		s.move(50, 10);
		await s.release(50, 10);
		expect(float.log).toEqual(["move 50,10", "vanish", "remove"]);
	});

	it("flies back and reports nothing when released outside every target", async () => {
		const a = new FakeTarget("a", 0, 100, { kind: "clearSlot" });
		const float = new FakeFloat();
		const ended: unknown[] = [];
		const s = session([a], float, ended);
		s.move(300, 10);
		await s.release(300, 10);
		expect(float.log).toEqual(["move 300,10", "fly 5,500", "remove"]);
		expect(ended).toEqual([null]);
	});

	it("a release without any move settles the card back with no result", async () => {
		const a = new FakeTarget("a", 0, 100, { kind: "clearSlot" });
		const float = new FakeFloat();
		const ended: unknown[] = [];
		const s = session([a], float, ended);
		await s.release(50, 10);
		expect(ended).toEqual([null]);
	});

	it("treats a target that refuses the drop as no target", async () => {
		const a = new FakeTarget("a", 0, 100, null);
		const float = new FakeFloat();
		const ended: unknown[] = [];
		const s = session([a], float, ended);
		s.move(50, 10);
		await s.release(50, 10);
		expect(float.log).toEqual(["move 50,10", "fly 5,500", "remove"]);
		expect(ended).toEqual([null]);
	});

	it("lets every target go once the card has landed: a list it was lifted from stands as it was again", async () => {
		const a = new FakeTarget("a", 0, 100, { kind: "clearSlot" });
		const b = new FakeTarget("b", 100, 200, { kind: "clearSlot" });
		const s = session([a, b], new FakeFloat(), []);
		s.move(50, 10);
		s.move(150, 10);
		await s.release(150, 10);
		expect(a.log).toEqual(["preview 50,10", "leave", "clear"]);
		expect(b.log).toEqual(["preview 150,10", "drop", "clear"]);
	});

	it("shows the lifted card on its place only once the copy has flown back there: the task is never seen twice", async () => {
		const order: string[] = [];
		const a = new FakeTarget("a", 0, 100, null);
		a.clear = () => void order.push("clear");
		const float = new FakeFloat();
		float.flyTo = async () => void order.push("fly");
		float.remove = () => void order.push("remove");
		const s = new DragSession({ payload, targets: [a], float, origin: () => rect(5, 500), onReturn: () => order.push("return"), onEnd: async () => {} });
		s.move(50, 10);
		await s.cancel();
		expect(order).toEqual(["clear", "fly", "return", "remove"]);
	});

	it("puts the screen back as it stood at the lift before the copy flies home, let go nowhere or called off", async () => {
		for (const end of ["nowhere", "cancel"] as const) {
			const order: string[] = [];
			const float = new FakeFloat();
			float.flyTo = async (to) => void order.push(`fly ${to.y}`);
			let place = 900;
			const s = new DragSession({
				payload,
				targets: [new FakeTarget("a", 0, 100, null)],
				float,
				origin: () => rect(5, place),
				beforeReturn: async () => {
					order.push("put back");
					place = 500;
				},
				letGo: () => order.push("screen free"),
				onEnd: async () => void order.push("ended"),
			});
			s.move(300, 10);
			await (end === "cancel" ? s.cancel() : s.release(300, 10));
			expect(order).toEqual(["put back", "screen free", "fly 500", "ended"]);
		}
	});

	it("keeps the screen until the screen put back is drawn: no new drag starts on what it redraws", async () => {
		let drawn: () => void = () => undefined;
		const letGo = vi.fn();
		const s = new DragSession({ payload, targets: [], float: new FakeFloat(), origin: () => rect(5, 500), beforeReturn: () => new Promise<void>((r) => (drawn = r)), letGo, onEnd: async () => undefined });
		const ending = s.cancel();
		await Promise.resolve();
		expect(letGo).not.toHaveBeenCalled();
		drawn();
		await ending;
		expect(letGo).toHaveBeenCalledTimes(1);
	});

	it("frees the screen at once when there is nothing to put back", () => {
		const letGo = vi.fn();
		const s = new DragSession({ payload, targets: [], float: new FakeFloat(), origin: () => rect(5, 500), beforeReturn: () => null, letGo, onEnd: async () => undefined });
		void s.cancel();
		expect(letGo).toHaveBeenCalledTimes(1);
	});

	it("puts nothing back when the drop is let go on a place", async () => {
		const beforeReturn = vi.fn(async () => undefined);
		const s = new DragSession({ payload, targets: [new FakeTarget("a", 0, 100, { kind: "clearSlot" })], float: new FakeFloat(), origin: () => rect(5, 500), beforeReturn, onEnd: async () => drawnCard(0) });
		s.move(50, 10);
		await s.release(50, 10);
		expect(beforeReturn).not.toHaveBeenCalled();
	});

	it("releases the dropped card's place only once the copy has landed on it", async () => {
		const order: string[] = [];
		const float = new FakeFloat();
		float.land = async () => void order.push("land");
		const s = new DragSession({
			payload,
			targets: [new FakeTarget("a", 0, 100, { kind: "clearSlot" })],
			float,
			origin: () => rect(5, 500),
			onReturn: () => order.push("return"),
			onEnd: async () => {
				order.push("written");
				return drawnCard(0);
			},
		});
		s.move(50, 10);
		await s.release(50, 10);
		expect(order).toEqual(["written", "land", "return"]);
	});

	describe("carrying a new task", () => {
		const fresh: NewTaskPayload = { from: "new", item: null, grabPx: 20 };

		it("hands the new task to the target under the pointer and reports where it landed", async () => {
			const slot: DropResult = { kind: "time", start: 990 };
			const a = new FakeTarget("a", 0, 100, slot);
			const float = new FakeFloat();
			const ended: unknown[] = [];
			const s = session([a], float, ended, fresh);
			s.move(50, 10);
			await s.release(50, 10);
			expect(float.log).toEqual(["move 50,10", "land 0,0", "remove"]);
			expect(ended).toEqual([slot]);
		});

		it("cancelled new drag returns null", async () => {
			const a = new FakeTarget("a", 0, 100, { kind: "clearSlot" });
			const float = new FakeFloat();
			const ended: unknown[] = [];
			const s = session([a], float, ended, fresh);
			s.move(50, 10);
			await s.cancel();
			expect(float.log).toEqual(["move 50,10", "fly 5,500", "remove"]);
			expect(ended).toEqual([null]);
		});
	});
});
