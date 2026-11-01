// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DropResult, DropTarget } from "../../src/ui/drag/DropTarget";
import { DragController, type DragControllerDeps } from "../../src/ui/drag/DragController";
import { GestureArbiter } from "../../src/ui/gestures";

const rect = (x: number, y: number) => new DOMRect(x, y, 44, 36);
const landing = new DOMRect(100, 200, 150, 40);

class StubTarget implements DropTarget {
	cleared = 0;
	constructor(private readonly result: DropResult) {}
	hitTest(x: number): boolean {
		return x >= 100;
	}
	preview(): void {}
	landing(): DOMRect {
		return landing;
	}
	clear(): void {
		this.cleared++;
	}
	drop(): DropResult {
		return this.result;
	}
}

function setup() {
	const calls: string[] = [];
	const arbiter = new GestureArbiter();
	const deps = {
		longPressMs: () => 300,
		day: () => "2026-11-01",
		step: () => 15,
		timeline: () => null,
		targets: () => [],
		haptics: { tap: () => calls.push("tap") },
		arbiter,
		onDragging: () => calls.push("dragging"),
		onResult: async () => {
			calls.push("result");
		},
	} as unknown as DragControllerDeps;
	const source = document.createElement("button");
	source.getBoundingClientRect = () => rect(10, 600);
	document.body.appendChild(source);
	return { controller: new DragController(deps), source, arbiter, calls };
}

const pointer = (type: string, x: number, y: number) => document.dispatchEvent(Object.assign(new Event(type), { pointerId: 1, clientX: x, clientY: y }));
const down = (x: number, y: number) => Object.assign(new Event("pointerdown"), { pointerId: 1, clientX: x, clientY: y }) as PointerEvent;

afterEach(() => {
	document.body.replaceChildren();
});

describe("DragController.beginNew", () => {
	it("shows a New task card, lifts nothing and offers no zones", () => {
		const { controller, source, calls } = setup();
		controller.beginNew(source, down(20, 610), [], vi.fn());
		expect(document.querySelector(".tc-float.is-new")?.textContent).toBe("New task");
		expect(document.querySelector(".tc-float.is-new svg")).not.toBeNull();
		expect(calls).not.toContain("dragging");
	});

	it("holds the screen, so a second card cannot start, and frees it after", async () => {
		const { controller, source, arbiter } = setup();
		expect(controller.beginNew(source, down(20, 610), [], vi.fn())).toBe(true);
		expect(arbiter.busy).toBe(true);
		expect(controller.beginNew(source, down(20, 610), [], vi.fn())).toBe(false);
		expect(document.querySelectorAll(".tc-float").length).toBe(1);
		pointer("pointerup", 20, 610);
		await vi.waitFor(() => expect(arbiter.busy).toBe(false));
	});

	it("flies back to the source and says null when let go off every target", async () => {
		const { controller, source } = setup();
		const onDrop = vi.fn();
		controller.beginNew(source, down(20, 610), [new StubTarget({ kind: "clearSlot" })], onDrop);
		pointer("pointermove", 30, 620);
		pointer("pointerup", 30, 620);
		await vi.waitFor(() => expect(onDrop).toHaveBeenCalledWith(null));
		expect(document.querySelector(".tc-float")).toBeNull();
	});

	it("flies back and says null when cancelled", async () => {
		const { controller, source } = setup();
		const onDrop = vi.fn();
		controller.beginNew(source, down(20, 610), [new StubTarget({ kind: "clearSlot" })], onDrop);
		pointer("pointermove", 150, 300);
		pointer("pointercancel", 150, 300);
		await vi.waitFor(() => expect(onDrop).toHaveBeenCalledWith(null));
		expect(document.querySelector(".tc-float")).toBeNull();
	});

	it("says where the card landed once it has landed on a target", async () => {
		const { controller, source, arbiter } = setup();
		const onDrop = vi.fn();
		const result: DropResult = { kind: "listBefore", before: null, column: "soon" };
		const target = new StubTarget(result);
		controller.beginNew(source, down(20, 610), [target], onDrop);
		pointer("pointermove", 150, 300);
		pointer("pointerup", 150, 300);
		await vi.waitFor(() => expect(onDrop).toHaveBeenCalledWith(result));
		expect(target.cleared).toBeGreaterThan(0);
		expect(document.querySelector(".tc-float")).toBeNull();
		expect(arbiter.busy).toBe(false);
	});

	it("holds the card where the finger holds the source, so the drop's place matches the card drawn", () => {
		const { controller, source } = setup();
		const target = new StubTarget({ kind: "clearSlot" });
		const preview = vi.spyOn(target, "preview");
		controller.beginNew(source, down(20, 610), [target], vi.fn());
		pointer("pointermove", 150, 300);
		expect(preview).toHaveBeenCalledWith(150, 300, expect.objectContaining({ grabPx: 10, grabX: 10 }));
		pointer("pointercancel", 150, 300);
	});

	it("never reports a drop that asks first as a place", async () => {
		const { controller, source } = setup();
		const onDrop = vi.fn();
		controller.beginNew(source, down(20, 610), [new StubTarget({ kind: "pickDate" })], onDrop);
		pointer("pointermove", 150, 300);
		pointer("pointerup", 150, 300);
		await vi.waitFor(() => expect(onDrop).toHaveBeenCalledWith(null));
	});
});

describe("DragController: a long tap on the timeline's free room", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("opens the field in the slot the target showed, the target let go as the field takes its place", () => {
		vi.useFakeTimers();
		const slot = { date: "2026-11-01", start: 600, end: null };
		const target = { previewNew: vi.fn(), clear: vi.fn(), slot };
		const opened: unknown[] = [];
		const deps = {
			longPressMs: () => 300,
			haptics: { tap: () => {} },
			arbiter: new GestureArbiter(),
			timeline: () => null,
			newSlot: () => target,
			onNewSlot: (s: unknown) => opened.push({ slot: s, cleared: target.clear.mock.calls.length }),
		} as unknown as DragControllerDeps;
		const canvas = document.body.appendChild(document.createElement("div"));
		new DragController(deps).attachCanvas(canvas);
		canvas.dispatchEvent(Object.assign(new Event("pointerdown"), { pointerId: 1, clientX: 50, clientY: 300, isPrimary: true, button: 0, pointerType: "touch" }));
		vi.advanceTimersByTime(300);
		expect(target.previewNew).toHaveBeenCalledWith(300);
		pointer("pointerup", 50, 300);
		expect(opened).toEqual([{ slot, cleared: 1 }]);
	});
});
