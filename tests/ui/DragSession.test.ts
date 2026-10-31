// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { DragSession, type DragPayload, type DropResult, type DropTarget, type Float } from "../../src/ui/drag/DragSession";

const item: TaskItem = { key: { section: "now", index: 1, path: [], raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: null, priority: null, subtasks: [], progress: null, parentText: null };
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

function session(targets: DropTarget[], float: FakeFloat, ended: unknown[]) {
	return new DragSession({
		payload,
		targets,
		float,
		origin: rect(5, 500),
		onEnd: async (result) => {
			ended.push(result);
		},
	});
}

describe("DragSession", () => {
	it("moves the float and previews on the target under the pointer, clearing the one left", () => {
		const a = new FakeTarget("a", 0, 100, { kind: "clearSlot" });
		const b = new FakeTarget("b", 100, 200, { kind: "clearSlot" });
		const float = new FakeFloat();
		const s = session([a, b], float, []);
		s.move(50, 10);
		s.move(150, 20);
		s.move(250, 30);
		expect(float.log).toEqual(["move 50,10", "move 150,20", "move 250,30"]);
		expect(a.log).toEqual(["preview 50,10", "clear"]);
		expect(b.log).toEqual(["preview 150,20", "clear"]);
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
});
