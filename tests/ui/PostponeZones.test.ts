// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import type { DragPayload } from "../../src/ui/drag/DropTarget";
import { PostponeZones } from "../../src/ui/drag/PostponeZones";

const item: TaskItem = { key: { section: "now", index: 0, path: [], raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: null, priority: null, subtasks: [], progress: null, parentText: null };
const drag: DragPayload = { item, from: "soon", durationMin: null, grabPx: 20, grabX: 20 };
const TODAY = "2026-10-30";

function setup(open: string) {
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	const zones = new PostponeZones(parent, () => TODAY, () => open);
	zones.show();
	const all = Array.from(parent.querySelectorAll<HTMLElement>(".tc-postpone > .tc-zone"));
	const shown = all.filter((z) => !z.hidden);
	shown.forEach((zone, i) => (zone.getBoundingClientRect = () => new DOMRect(205, 624 + i * 48, 173, 40)));
	all.filter((z) => z.hidden).forEach((zone) => (zone.getBoundingClientRect = () => new DOMRect(205, 600, 173, 40)));
	const at = (i: number) => ({ x: 250, y: 644 + i * 48 });
	const hit = (i: number) => zones.targets.find((t) => t.hitTest(at(i).x, at(i).y, drag)) ?? null;
	return { zones, shown, hit, at };
}

const labels = (zones: HTMLElement[]) => zones.map((z) => z.textContent);

describe("PostponeZones", () => {
	it("offers Tomorrow and Pick a date while today is open", () => {
		expect(labels(setup(TODAY).shown)).toEqual(["Tomorrow", "Pick a date"]);
	});

	it("offers Today and Pick a date while tomorrow is open: tomorrow is the column itself", () => {
		expect(labels(setup("2026-10-31").shown)).toEqual(["Today", "Pick a date"]);
	});

	it("offers Today, Tomorrow and Pick a date while another day is open", () => {
		expect(labels(setup("2026-11-04").shown)).toEqual(["Today", "Tomorrow", "Pick a date"]);
	});

	it("puts the task off to today or tomorrow, the card landing in the zone", () => {
		const { shown, hit, at } = setup("2026-11-04");
		const today = hit(0)!;
		expect(today.drop(at(0).x, at(0).y, drag)).toEqual({ kind: "postpone", date: TODAY });
		expect(today.landing()).toEqual(shown[0].getBoundingClientRect());
		const tomorrow = hit(1)!;
		tomorrow.preview(at(1).x, at(1).y, drag);
		expect(shown[1].classList.contains("is-hot")).toBe(true);
		expect(tomorrow.drop(at(1).x, at(1).y, drag)).toEqual({ kind: "postpone", date: "2026-10-31" });
		tomorrow.clear();
		expect(shown[1].classList.contains("is-hot")).toBe(false);
	});

	it("asks for a day on a drop on Pick a date, the card going back to its place", () => {
		const { hit, at } = setup(TODAY);
		const pick = hit(1)!;
		expect(pick.landing()).toBeNull();
		expect(pick.drop(at(1).x, at(1).y, drag)).toEqual({ kind: "pickDate" });
	});

	it("never takes a drop on a zone it does not offer, nor outside the zones", () => {
		const { zones } = setup(TODAY);
		expect(zones.targets.some((t) => t.hitTest(250, 610, drag))).toBe(false);
		expect(zones.targets.some((t) => t.hitTest(100, 644, drag))).toBe(false);
	});
});
