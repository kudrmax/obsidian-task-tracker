// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import type { DragPayload } from "../../src/ui/drag/DropTarget";
import { PostponeZones } from "../../src/ui/drag/PostponeZones";

const item: TaskItem = { key: { section: "now", index: 0, raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: null, priority: null };
const drag: DragPayload = { item, from: "left", durationMin: null, grabPx: 20 };

function setup() {
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	const zones = new PostponeZones(parent, () => "2026-10-30");
	const [tomorrow, pick] = Array.from(parent.querySelectorAll<HTMLElement>(".tc-zone"));
	const place = (zone: HTMLElement, top: number) => (zone.getBoundingClientRect = () => new DOMRect(10, top, 160, 40));
	place(tomorrow, 700);
	place(pick, 748);
	return { parent, zones, tomorrow, pick };
}

describe("PostponeZones", () => {
	it("draws Tomorrow and Pick a date", () => {
		const { parent } = setup();
		expect(Array.from(parent.querySelectorAll(".tc-zone")).map((z) => z.textContent)).toEqual(["Tomorrow", "Pick a date"]);
	});

	it("puts the task off to tomorrow on a drop on Tomorrow, landing in the zone", () => {
		const { zones, tomorrow } = setup();
		const target = zones.targets.find((t) => t.hitTest(50, 720, drag))!;
		target.preview(50, 720, drag);
		expect(tomorrow.classList.contains("is-hot")).toBe(true);
		expect(target.landing()).toEqual(tomorrow.getBoundingClientRect());
		expect(target.drop(50, 720, drag)).toEqual({ kind: "postpone", date: "2026-10-31" });
		target.clear();
		expect(tomorrow.classList.contains("is-hot")).toBe(false);
	});

	it("asks for a day on a drop on Pick a date, the card going back to its place", () => {
		const { zones, pick } = setup();
		const target = zones.targets.find((t) => t.hitTest(50, 760, drag))!;
		target.preview(50, 760, drag);
		expect(pick.classList.contains("is-hot")).toBe(true);
		expect(target.landing()).toBeNull();
		expect(target.drop(50, 760, drag)).toEqual({ kind: "pickDate" });
	});

	it("misses outside the zones", () => {
		const { zones } = setup();
		expect(zones.targets.some((t) => t.hitTest(50, 600, drag))).toBe(false);
		expect(zones.targets.some((t) => t.hitTest(200, 720, drag))).toBe(false);
	});
});
