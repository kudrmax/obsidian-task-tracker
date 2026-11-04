// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroupName, TaskItem } from "../../src/application/contracts";
import { GroupDrag, liftedPlace, nearestSlot } from "../../src/ui/drag/GroupDrag";
import { GestureArbiter } from "../../src/ui/gestures";
import { TaskList } from "../../src/ui/TaskList";

const GROUPS = [null, "Morning", "Экскурсия"];

describe("a lifted section", () => {
	it("a drop between Morning and Экскурсия moves the group before Экскурсия", () => {
		expect(liftedPlace(GROUPS, 0, 2)).toEqual({ before: "Экскурсия" });
	});

	it("a drop after the last group is end", () => {
		expect(liftedPlace(GROUPS, 1, 3)).toBe("end");
	});

	it("the ungrouped group moves too, and others go above it", () => {
		expect(liftedPlace(GROUPS, 0, 3)).toBe("end");
		expect(liftedPlace(GROUPS, 2, 0)).toEqual({ before: null });
	});

	it("its own place moves nothing", () => {
		expect(liftedPlace(GROUPS, 1, 1)).toBeNull();
		expect(liftedPlace(GROUPS, 1, 2)).toBeNull();
	});

	it("nearestSlot takes the slot whose place is closest to the finger", () => {
		expect(nearestSlot([100, 200, 300, 400], 240)).toBe(1);
		expect(nearestSlot([100, 200, 300, 400], 900)).toBe(3);
	});
});

describe("a section carried (block 3)", () => {
	const item = (index: number, group: GroupName): TaskItem => ({
		key: { section: "soon", index, path: [], raw: `- [ ] T${index}` },
		text: `T${index}`,
		status: "todo",
		dueDate: null,
		slot: null,
		repeat: null,
		priority: null,
		group,
		subtasks: [],
		progress: null,
		parentText: null,
		description: null,
	});
	const pointer = (type: string, x: number, y: number) => new PointerEvent(type, { clientX: x, clientY: y, pointerId: 3, isPrimary: true, button: 0, bubbles: true, pointerType: "touch" });

	afterEach(() => {
		vi.useRealTimers();
		document.body.replaceChildren();
	});

	it("moves the mark only when the slot changes", () => {
		vi.useFakeTimers();
		const items = [item(0, "A"), item(1, "B"), item(2, "C")];
		const list = new TaskList(document.createElement("div"), { items: () => items, day: () => null, grouped: () => true, ungroupedName: () => "No section" });
		document.body.appendChild(list.el);
		list.render();
		list.elements.forEach((node, i) => (node.getBoundingClientRect = () => new DOMRect(10, 100 + i * 40, 175, 35)));
		const heads = list.elements.filter((node) => node.classList.contains("tc-group-head"));
		const drag = new GroupDrag({ longPressMs: () => 250, arbiter: new GestureArbiter(), haptics: { tap: () => {} } as never, ungroupedName: () => "No section", onTap: () => {}, onMove: async () => {} });
		drag.attach(heads[2], "soon", list, list.groups[2]);
		heads[2].dispatchEvent(pointer("pointerdown", 50, 270));
		vi.advanceTimersByTime(250);
		const watch = new MutationObserver(() => undefined);
		watch.observe(list.el, { childList: true });
		document.dispatchEvent(pointer("pointermove", 50, 100));
		expect(watch.takeRecords().length).toBeGreaterThan(0);
		for (let i = 0; i < 20; i++) document.dispatchEvent(pointer("pointermove", 50, 98 + (i % 5)));
		expect(watch.takeRecords()).toEqual([]);
		document.dispatchEvent(pointer("pointermove", 50, 180));
		expect(watch.takeRecords().length).toBeGreaterThan(0);
		expect(list.el.querySelector(".tc-group-drop")?.nextElementSibling).toBe(heads[1]);
		watch.disconnect();
		document.dispatchEvent(pointer("pointercancel", 50, 180));
	});
});
