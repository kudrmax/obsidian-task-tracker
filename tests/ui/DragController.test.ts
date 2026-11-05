// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
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
	leave(): void {}
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
	it("carries the plus itself, lifts nothing and offers no zones", () => {
		const { controller, source, calls } = setup();
		controller.beginNew(source, down(20, 610), [], vi.fn());
		expect(document.querySelector(".tc-float-plus svg")).not.toBeNull();
		expect(document.querySelector(".tc-float")).toBeNull();
		expect(calls).not.toContain("dragging");
	});

	it("holds the screen, so a second card cannot start, and frees it after", async () => {
		const { controller, source, arbiter } = setup();
		expect(controller.beginNew(source, down(20, 610), [], vi.fn())).toBe(true);
		expect(arbiter.busy).toBe(true);
		expect(controller.beginNew(source, down(20, 610), [], vi.fn())).toBe(false);
		expect(document.querySelectorAll(".tc-float-plus").length).toBe(1);
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
		expect(document.querySelector(".tc-float-plus")).toBeNull();
	});

	it("flies back and says null when cancelled", async () => {
		const { controller, source } = setup();
		const onDrop = vi.fn();
		controller.beginNew(source, down(20, 610), [new StubTarget({ kind: "clearSlot" })], onDrop);
		pointer("pointermove", 150, 300);
		pointer("pointercancel", 150, 300);
		await vi.waitFor(() => expect(onDrop).toHaveBeenCalledWith(null));
		expect(document.querySelector(".tc-float-plus")).toBeNull();
	});

	it("says where the task goes on a target, and the plus is gone once it has shrunk", async () => {
		const { controller, source, arbiter } = setup();
		const onDrop = vi.fn();
		const result: DropResult = { kind: "list", column: "soon", before: null };
		const target = new StubTarget(result);
		controller.beginNew(source, down(20, 610), [target], onDrop);
		pointer("pointermove", 150, 300);
		pointer("pointerup", 150, 300);
		await vi.waitFor(() => expect(onDrop).toHaveBeenCalledWith(result));
		expect(target.cleared).toBeGreaterThan(0);
		await vi.waitFor(() => expect(document.querySelector(".tc-float-plus")).toBeNull());
		expect(arbiter.busy).toBe(false);
	});

	it("says where the task goes as the finger lifts, the screen free and the line gone, while the plus still shrinks", () => {
		const { controller, source, arbiter } = setup();
		const onDrop = vi.fn();
		const result: DropResult = { kind: "list", column: "soon", before: null };
		const target = new StubTarget(result);
		controller.beginNew(source, down(20, 610), [target], onDrop);
		pointer("pointermove", 150, 300);
		pointer("pointerup", 150, 300);
		expect(onDrop).toHaveBeenCalledWith(result);
		expect(arbiter.busy).toBe(false);
		expect(target.cleared).toBeGreaterThan(0);
		expect(document.querySelector(".tc-float-plus")).not.toBeNull();
	});

	it("shows the target under the finger from the lift, before any move", () => {
		const { controller, source } = setup();
		const seen: number[][] = [];
		const target: DropTarget = { ...new StubTarget({ kind: "clearSlot" }), hitTest: () => true, landing: () => landing, leave: () => {}, clear: () => {}, drop: () => null, preview: (x, y) => void seen.push([x, y]) };
		controller.beginNew(source, down(120, 610), [target], vi.fn());
		expect(seen).toEqual([[120, 610]]);
	});

	it("holds the card where the finger holds the source, so the drop's place matches the card drawn", () => {
		const { controller, source } = setup();
		const target = new StubTarget({ kind: "clearSlot" });
		const preview = vi.spyOn(target, "preview");
		controller.beginNew(source, down(20, 610), [target], vi.fn());
		pointer("pointermove", 150, 300);
		expect(preview).toHaveBeenCalledWith(150, 300, expect.objectContaining({ grabPx: 10 }));
		pointer("pointercancel", 150, 300);
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

	it("lets the target go when its finger's lift never arrives: the next finger down frees the screen", () => {
		vi.useFakeTimers();
		const target = { previewNew: vi.fn(), clear: vi.fn(), slot: { date: "2026-11-01", start: 600, end: null } };
		const arbiter = new GestureArbiter();
		const onNewSlot = vi.fn();
		const deps = { longPressMs: () => 300, haptics: { tap: () => {} }, arbiter, timeline: () => null, newSlot: () => target, onNewSlot } as unknown as DragControllerDeps;
		const canvas = document.body.appendChild(document.createElement("div"));
		new DragController(deps).attachCanvas(canvas);
		canvas.dispatchEvent(Object.assign(new Event("pointerdown"), { pointerId: 1, clientX: 50, clientY: 300, isPrimary: true, button: 0, pointerType: "touch" }));
		vi.advanceTimersByTime(300);
		expect(arbiter.busy).toBe(true);
		document.body.dispatchEvent(Object.assign(new Event("pointerdown", { bubbles: true }), { pointerId: 2, clientX: 80, clientY: 400, isPrimary: true, button: 0, pointerType: "touch" }));
		expect(arbiter.busy).toBe(false);
		expect(target.clear).toHaveBeenCalledTimes(1);
		expect(onNewSlot).not.toHaveBeenCalled();
	});
});

describe("DragController: a drop that changes nothing", () => {
	it("shows the lifted block again once the result is applied, though nothing was drawn anew", async () => {
		const target = new StubTarget({ kind: "clearSlot" });
		const deps = {
			longPressMs: () => 300,
			day: () => "2026-11-01",
			step: () => 15,
			timeline: () => null,
			targets: () => [target],
			haptics: { tap: () => {} },
			arbiter: new GestureArbiter(),
			onDragging: () => {},
			onResult: async () => {},
		} as unknown as DragControllerDeps;
		const block = document.body.appendChild(document.createElement("div"));
		block.getBoundingClientRect = () => rect(10, 600);
		const item = { key: { section: "now", index: 0, path: [], raw: "- [ ] A" }, text: "A", status: "todo", priority: null, labels: [], dueDate: null, description: null, subtasks: [], links: [], slot: { date: "2026-11-01", start: 600, end: 660 } };
		new DragController(deps).attachBlock(block, item as never);
		const at = (type: string, x: number, y: number, el: EventTarget) =>
			el.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerId: 1, clientX: x, clientY: y, isPrimary: true, button: 0, pointerType: "mouse" }));
		at("pointerdown", 20, 610, block);
		at("pointermove", 150, 300, block);
		expect(block.classList.contains("is-lifted")).toBe(true);
		at("pointermove", 150, 300, document);
		at("pointerup", 150, 300, document);
		await vi.waitFor(() => expect(block.classList.contains("is-lifted")).toBe(false));
	});
});

describe("DragController: a finger held on a timeline block", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	function held() {
		vi.useFakeTimers();
		const arbiter = new GestureArbiter();
		const menu = { close: vi.fn(), onClickedAgain: vi.fn() };
		const deps = {
			longPressMs: () => 300,
			day: () => "2026-11-01",
			step: () => 15,
			timeline: () => null,
			targets: () => [],
			haptics: { tap: () => {} },
			arbiter,
			onDragging: () => {},
			onResult: async () => {},
			onMenu: () => menu,
		} as unknown as DragControllerDeps;
		const block = document.body.appendChild(document.createElement("div"));
		block.getBoundingClientRect = () => rect(10, 600);
		const item = { key: { section: "now", index: 0, path: [], raw: "- [ ] A" }, text: "A", status: "todo", priority: null, labels: [], dueDate: null, description: null, subtasks: [], links: [], slot: { date: "2026-11-01", start: 600, end: 660 } };
		new DragController(deps).attachBlock(block, item as never);
		block.dispatchEvent(Object.assign(new Event("pointerdown", { bubbles: true }), { pointerId: 1, clientX: 20, clientY: 610, isPrimary: true, button: 0, pointerType: "touch" }));
		vi.advanceTimersByTime(300);
		return { arbiter, menu, block };
	}

	it("holds the screen from the moment the menu opens: no swipe or scroll takes the finger before it moves on", () => {
		const { arbiter, menu } = held();
		expect(menu.close).not.toHaveBeenCalled();
		expect(arbiter.busy).toBe(true);
		expect(arbiter.claim("swipe")).toBe(false);
	});

	it("passes the screen to the drag as the finger moves on, with no free moment between", () => {
		const { arbiter, menu, block } = held();
		const idle = vi.fn();
		arbiter.onIdle(idle);
		pointer("pointermove", 20, 660);
		expect(menu.close).toHaveBeenCalled();
		expect(block.classList.contains("is-lifted")).toBe(true);
		expect(arbiter.busy).toBe(true);
		expect(idle).not.toHaveBeenCalled();
		pointer("pointercancel", 20, 660);
	});

	it("frees the screen when the finger lifts with the menu open", () => {
		const { arbiter, block } = held();
		pointer("pointerup", 20, 610);
		expect(arbiter.busy).toBe(false);
		expect(block.classList.contains("is-lifted")).toBe(false);
	});
});

describe("DragController: a tap on a list card", () => {
	function tapped(on: (card: HTMLElement) => HTMLElement, fold: (pressed: EventTarget | null) => boolean) {
		const onMenu = vi.fn(() => ({ close: vi.fn(), onClickedAgain: vi.fn() }));
		const deps = { longPressMs: () => 300, haptics: { tap: () => {} }, arbiter: new GestureArbiter(), onMenu, fold: (_item: TaskItem, pressed: EventTarget | null) => fold(pressed) } as unknown as DragControllerDeps;
		const card = document.body.appendChild(document.createElement("div"));
		const count = card.appendChild(document.createElement("span"));
		count.className = "tc-count";
		new DragController(deps).attachCard(card, { key: { section: "now", index: 0, path: [], raw: "- [ ] A" } } as unknown as TaskItem, "left");
		on(card).dispatchEvent(Object.assign(new Event("pointerdown", { bubbles: true }), { pointerId: 1, clientX: 20, clientY: 610, isPrimary: true, button: 0, pointerType: "touch" }));
		card.dispatchEvent(Object.assign(new Event("pointerup", { bubbles: true }), { pointerId: 1, clientX: 20, clientY: 610, pointerType: "touch" }));
		return { onMenu, count };
	}

	it("asks to fold with the element the press began on, though the card captured the release; a fold keeps the menu shut", () => {
		const seen: (EventTarget | null)[] = [];
		const { onMenu, count } = tapped((card) => card.querySelector<HTMLElement>(".tc-count")!, (pressed) => (seen.push(pressed), true));
		expect(seen).toEqual([count]);
		expect(onMenu).not.toHaveBeenCalled();
	});

	it("opens the menu when the tap folds nothing", () => {
		const { onMenu } = tapped((card) => card, () => false);
		expect(onMenu).toHaveBeenCalledTimes(1);
	});
});

describe("DragController: a finger held on a calendar event", () => {
	it("keeps the screen until it lifts, so the menu opened stays over a day no swipe or scroll moves", () => {
		vi.useFakeTimers();
		const arbiter = new GestureArbiter();
		const onMenu = vi.fn();
		const deps = { longPressMs: () => 300, haptics: { tap: () => {} }, arbiter } as unknown as DragControllerDeps;
		const block = document.body.appendChild(document.createElement("div"));
		new DragController(deps).attachEvent(block, onMenu);
		block.dispatchEvent(Object.assign(new Event("pointerdown", { bubbles: true }), { pointerId: 1, clientX: 20, clientY: 610, isPrimary: true, button: 0, pointerType: "touch" }));
		vi.advanceTimersByTime(300);
		expect(onMenu).toHaveBeenCalledTimes(1);
		pointer("pointermove", 200, 610);
		expect(arbiter.busy).toBe(true);
		pointer("pointerup", 200, 610);
		expect(arbiter.busy).toBe(false);
		vi.useRealTimers();
	});
});

describe("DragController: stretching a block (block 3)", () => {
	const item = { key: { section: "now", index: 0, path: [], raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: { date: "2026-11-01", start: 600, end: 660 }, priority: null, labels: [], subtasks: [], progress: null, parentText: null, description: null, group: null, list: "now", isSubtask: false } as unknown as TaskItem;

	function stretching(onResize: () => Promise<void> = async () => undefined) {
		const arbiter = new GestureArbiter();
		const timeline = {
			minutesAt: (y: number) => y,
			shownSpan: () => ({ start: 600, end: 660 }),
			stretchTo: vi.fn(),
			slotAt: (start: number, end: number | null) => ({ date: "2026-11-01", start, end }),
			hourPx: 56,
			endStretch: vi.fn(),
		};
		const deps = { step: () => 15, timeline: () => timeline, haptics: { tap: () => {} }, arbiter, onResize: vi.fn(onResize) } as unknown as DragControllerDeps;
		const block = document.body.appendChild(document.createElement("div"));
		new DragController(deps).grip(block, item, "end", down(50, 660));
		return { arbiter, timeline, deps };
	}

	it("stretches the block once per grid step, not per pixel", () => {
		const { timeline } = stretching();
		for (let i = 0; i < 30; i++) pointer("pointermove", 50, 653 + (i % 15));
		expect(timeline.stretchTo).toHaveBeenCalledTimes(1);
		pointer("pointermove", 50, 676);
		expect(timeline.stretchTo).toHaveBeenCalledTimes(2);
		pointer("pointercancel", 50, 676);
	});

	it("holds the screen until the change is written: no second grab starts from the old time", async () => {
		let written = () => {};
		const { arbiter, timeline } = stretching(() => new Promise<void>((resolve) => (written = resolve)));
		pointer("pointermove", 50, 720);
		pointer("pointerup", 50, 720);
		expect(arbiter.busy).toBe(true);
		expect(timeline.endStretch).not.toHaveBeenCalled();
		written();
		await vi.waitFor(() => expect(arbiter.busy).toBe(false));
		expect(timeline.endStretch).toHaveBeenCalledWith(item.key);
	});

	it("puts the block back when the write fails", async () => {
		const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { timeline } = stretching(() => Promise.reject(new Error("the file changed")));
		pointer("pointermove", 50, 720);
		pointer("pointerup", 50, 720);
		await vi.waitFor(() => expect(timeline.endStretch).toHaveBeenCalledWith(item.key));
		quiet.mockRestore();
	});
});
