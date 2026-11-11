// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { TaskItem } from "../../core/application/contracts";
import { DESIGN } from "../../obsidian/ui/design";
import { FloatingCard } from "../../obsidian/ui/drag/FloatingCard";
import { onDay } from "../fakes/itemOnDay";

const item = (): TaskItem =>
	onDay(
		{ key: { section: "now", index: 0, path: [], raw: "- [ ] A long title" }, text: "A long title", status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, group: null, subtasks: [], progress: null, parentText: null, description: null, list: "now", isSubtask: false },
		"2026-11-01",
	);

const left = (float: FloatingCard) => parseFloat(/translate3d\(([-\d.]+)px/.exec(float.el.style.transform)![1]);

describe("the card carried under the finger", () => {
	afterEach(() => document.body.replaceChildren());

	it("follows the finger where it was grabbed", () => {
		const float = new FloatingCard(item(), { dx: 40, dy: 10 }, "2026-11-01");
		Object.defineProperty(float.el, "offsetWidth", { value: DESIGN.floatWidth });
		float.moveTo(100, 200);
		expect(left(float)).toBe(60);
	});

	it("stretched to show its whole title, stays inside the window, never further left than the card under the finger needs", () => {
		const float = new FloatingCard(item(), { dx: 40, dy: 10 }, "2026-11-01");
		Object.defineProperty(float.el, "offsetWidth", { value: window.innerWidth - 20 });
		float.moveTo(100, 200);
		expect(left(float) + float.el.offsetWidth).toBeLessThanOrEqual(window.innerWidth);
		float.moveTo(window.innerWidth - 10, 200);
		expect(left(float) + float.el.offsetWidth).toBe(window.innerWidth - 10 - 40 + DESIGN.floatWidth);
	});

	it("over the tree it takes its own width and rides above the finger, its middle over it; off the tree it is held as grabbed again", () => {
		const float = new FloatingCard(item(), { dx: 40, dy: 10 }, "2026-11-01");
		const top = () => parseFloat(/translate3d\([-\d.]+px, ([-\d.]+)px/.exec(float.el.style.transform)![1]);
		Object.defineProperty(float.el, "offsetWidth", { get: () => parseFloat(float.el.style.width) || DESIGN.floatWidth });
		float.el.style.width = "300px";
		float.rideAbove(true);
		float.moveTo(200, 300);
		expect(float.el.classList.contains("is-aside")).toBe(true);
		expect(float.el.style.width).toBe(`${DESIGN.floatWidth}px`);
		expect(left(float)).toBe(200 - DESIGN.floatWidth / 2);
		expect(top()).toBe(300);
		float.rideAbove(false);
		float.moveTo(200, 300);
		expect(float.el.classList.contains("is-aside")).toBe(false);
		expect(float.el.style.width).toBe("300px");
		expect(top()).toBe(290);
	});

	it("riding above the finger near the window's edge, it stays inside the window", () => {
		const float = new FloatingCard(item(), { dx: 40, dy: 10 }, "2026-11-01");
		Object.defineProperty(float.el, "offsetWidth", { get: () => DESIGN.floatWidth });
		float.rideAbove(true);
		float.moveTo(20, 300);
		expect(left(float)).toBeGreaterThanOrEqual(0);
	});
});
