// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import type { DragPayload } from "../../src/ui/drag/DropTarget";
import { GroupZones } from "../../src/ui/drag/GroupZones";

const item: TaskItem = { key: { section: "soon", index: 0, path: [], raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: null, priority: null, group: null, subtasks: [], progress: null, parentText: null };
const drag: DragPayload = { item, from: "soon", durationMin: null, grabPx: 17, grabX: 17 };

function setup(presets: string[], present: string[], offered = true) {
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	const zones = new GroupZones(parent, "now", { presets: () => presets, present: () => present, offered: () => offered });
	zones.show();
	const shown = Array.from(parent.querySelectorAll<HTMLElement>(".tc-zone")).filter((z) => !z.hidden);
	shown.forEach((zone, i) => (zone.getBoundingClientRect = () => new DOMRect(10, 500 + i * 43, 175, 35)));
	const at = (i: number) => ({ x: 50, y: 510 + i * 43 });
	const target = (i: number) => zones.targets.find((t) => t.hitTest(at(i).x, at(i).y, drag)) ?? null;
	return { parent, shown, target, at };
}

const labels = (zones: HTMLElement[]) => zones.map((z) => z.textContent);

describe("GroupZones", () => {
	it("offers presets the list lacks, in settings order, then New section", () => {
		expect(labels(setup(["Morning", "Afternoon", "Evening"], ["Morning"]).shown)).toEqual(["Afternoon", "Evening", "New section"]);
	});

	it("only New section when every preset is there", () => {
		expect(labels(setup(["Morning"], ["Morning"]).shown)).toEqual(["New section"]);
	});

	it("blank and repeated presets are no zones", () => {
		expect(labels(setup(["Morning", " ", "Morning", " Evening "], []).shown)).toEqual(["Morning", "Evening", "New section"]);
	});

	it("nothing where the column shows no sections", () => {
		expect(setup(["Morning"], [], false).shown).toEqual([]);
	});

	it("a drop on a preset is newGroup with its name; on New section it asks for the name", () => {
		const { target, at } = setup(["Morning", "Evening"], []);
		expect(target(1)!.drop(at(1).x, at(1).y, drag)).toEqual({ kind: "newGroup", list: "now", name: "Evening" });
		expect(target(2)!.drop(at(2).x, at(2).y, drag)).toEqual({ kind: "nameGroup", list: "now" });
	});

	it("lights the zone under the finger", () => {
		const { target, shown, at } = setup(["Morning"], []);
		target(0)!.preview(at(0).x, at(0).y, drag);
		expect(shown[0].classList.contains("is-hot")).toBe(true);
	});
});
