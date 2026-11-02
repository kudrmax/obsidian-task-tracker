// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { DragSession, type DragPayload, type DropResult, type DropTarget, type Float, type NewTaskPayload } from "../../src/ui/drag/DragSession";

const item: TaskItem = { key: { section: "now", index: 1, path: [], raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: null, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null };
const payload: DragPayload = { item, from: "left", durationMin: null, grabPx: 20, grabX: 20 };
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
	async flyTo(to: DOMRect): Promise<void> {
		this.log.push(`fly ${to.x},${to.y}`);
	}
	remove(): void {
		this.log.push("remove");
	}
}

function session(targets: DropTarget[], float: FakeFloat, ended: unknown[], carried: DragPayload = payload) {
	return new DragSession({
		payload: carried,
		targets,
		float,
		origin: rect(5, 500),
		onEnd: async (result) => {
			ended.push(result);
		},
	});
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

	it("drops on the target, flies the float there and reports the result", async () => {
		const slot: DropResult = { kind: "slot", slot: { date: "2026-10-30", start: 990, end: 1050 } };
		const a = new FakeTarget("a", 0, 100, slot);
		const float = new FakeFloat();
		const ended: unknown[] = [];
		const s = session([a], float, ended);
		s.move(50, 10);
		await s.release(50, 10);
		expect(a.log).toEqual(["preview 50,10", "drop", "clear"]);
		expect(float.log).toEqual(["move 50,10", "fly 0,0", "remove"]);
		expect(ended).toEqual([slot]);
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

	it("opens the lifted card's place again before the targets let go, as the card flies back", async () => {
		const order: string[] = [];
		const a = new FakeTarget("a", 0, 100, null);
		a.clear = () => void order.push("clear");
		const s = new DragSession({ payload, targets: [a], float: new FakeFloat(), origin: rect(5, 500), onReturn: () => order.push("return"), onEnd: async () => {} });
		s.move(50, 10);
		await s.cancel();
		expect(order).toEqual(["return", "clear"]);
	});

	describe("zones over the place a card was lifted from", () => {
		class Zone extends FakeTarget {
			readonly waitsForEntry = true;
		}

		it("a zone under the finger at the lift takes nothing until the finger has left it", async () => {
			const zone = new Zone("zone", 0, 100, { kind: "postpone", date: "2026-11-04" });
			const ended: unknown[] = [];
			const s = session([zone], new FakeFloat(), ended);
			s.start(50, 10);
			s.move(60, 10);
			expect(zone.log).toEqual([]);
			await s.release(60, 10);
			expect(ended).toEqual([null]);
		});

		it("nor does a list behind it, whose area reaches under the zones", async () => {
			const zone = new Zone("zone", 0, 100, { kind: "clearSlot" });
			const list = new FakeTarget("list", 0, 300, { kind: "clearSlot" });
			const ended: unknown[] = [];
			const s = session([zone, list], new FakeFloat(), ended);
			s.start(50, 10);
			expect(list.log).toEqual([]);
			s.move(150, 10);
			expect(list.log).toEqual(["preview 150,10"]);
			s.move(50, 10);
			await s.release(50, 10);
			expect(zone.log).toEqual(["preview 50,10", "drop", "clear"]);
		});

		it("left and come back to, it lights and takes the card", async () => {
			const result: DropResult = { kind: "postpone", date: "2026-11-04" };
			const zone = new Zone("zone", 0, 100, result);
			const ended: unknown[] = [];
			const s = session([zone], new FakeFloat(), ended);
			s.start(50, 10);
			s.move(150, 10);
			s.move(50, 10);
			expect(zone.log).toEqual(["preview 50,10"]);
			await s.release(50, 10);
			expect(ended).toEqual([result]);
		});

		it("other zones and the lists answer at once, and every target hears of the lift", () => {
			const lifts: string[] = [];
			const zone = new Zone("zone", 0, 100, null);
			const other = new Zone("other", 100, 200, null);
			const list = new FakeTarget("list", 200, 300, null);
			for (const t of [zone, other, list] as DropTarget[]) (t as { lift?: () => void }).lift = () => void lifts.push(String(t));
			const s = session([zone, other, list], new FakeFloat(), []);
			s.start(50, 10);
			expect(lifts).toEqual(["zone", "other", "list"]);
			s.move(150, 10);
			s.move(250, 10);
			expect(other.log).toEqual(["preview 150,10", "leave"]);
			expect(list.log).toEqual(["preview 250,10"]);
		});
	});

	describe("carrying a new task", () => {
		const fresh: NewTaskPayload = { from: "new", item: null, durationMin: null, grabPx: 20, grabX: 20 };

		it("hands the new task to the target under the pointer and reports where it landed", async () => {
			const slot: DropResult = { kind: "slot", slot: { date: "2026-10-30", start: 990, end: null } };
			const a = new FakeTarget("a", 0, 100, slot);
			const float = new FakeFloat();
			const ended: unknown[] = [];
			const s = session([a], float, ended, fresh);
			s.move(50, 10);
			await s.release(50, 10);
			expect(float.log).toEqual(["move 50,10", "fly 0,0", "remove"]);
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
