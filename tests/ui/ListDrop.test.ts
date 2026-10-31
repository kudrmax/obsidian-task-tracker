// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { GroupedList, GroupName, SectionKey, TaskItem } from "../../src/application/contracts";
import type { DragPayload, ListColumn } from "../../src/ui/drag/DropTarget";
import { ListDrop } from "../../src/ui/drag/ListDrop";
import { TaskList } from "../../src/ui/TaskList";

const item = (section: SectionKey, index: number, text: string, group: GroupName): TaskItem => ({
	key: { section, index, path: [], raw: `- [ ] ${text}` },
	text,
	status: "todo",
	dueDate: null,
	slot: null,
	priority: null,
	group,
	subtasks: [],
	progress: null,
	parentText: null,
});

function setup(items: TaskItem[], column: ListColumn, grouped: GroupedList | null, date: string | null = null) {
	const area = document.createElement("div");
	document.body.appendChild(area);
	const list = new TaskList(document.createElement("div"), {
		items: () => items,
		day: () => null,
		grouped: () => grouped !== null,
		ungroupedName: () => "No section",
	});
	area.appendChild(list.el);
	list.render();
	area.getBoundingClientRect = () => new DOMRect(0, 100, 187, 554);
	list.elements.forEach((node, i) => (node.getBoundingClientRect = () => new DOMRect(10, 100 + i * 40, 175, 35)));
	const drop = new ListDrop(list, area, column, () => true, () => (grouped ? { list: grouped, date } : null));
	return { list, drop };
}

const drag = (from: ListColumn | "timeline", it: TaskItem): DragPayload => ({ item: it, from, durationMin: null, grabPx: 17, grabX: 17 });

describe("ListDrop", () => {
	it("draws a header per group once a list has a section", () => {
		const { list } = setup([item("soon", 0, "A", null), item("soon", 1, "B", "Morning")], "soon", "soon");
		expect(Array.from(list.el.children).map((n) => n.textContent)).toEqual(["No section", "A", "Morning", "B"]);
		expect(list.el.querySelector(".tc-group-head")?.classList.contains("is-ungrouped")).toBe(true);
	});

	it("in a grouped list a card from another column takes a gap", () => {
		const b = item("soon", 1, "B", "Morning");
		const { drop, list } = setup([item("soon", 0, "A", null), b, item("soon", 2, "C", "Morning")], "soon", "soon");
		const from = drag("left", item("now", 0, "N", null));
		drop.preview(50, 100 + 3 * 40 + 2, from);
		expect(list.elements.map((n) => n.classList.contains("is-shifted"))).toEqual([false, false, false, true, true]);
		expect(document.querySelector(".tc-drop-gap")).not.toBeNull();
		expect(drop.drop(50, 100 + 3 * 40 + 2, from)).toEqual({ kind: "group", list: "soon", date: null, group: "Morning", before: b.key });
		drop.clear();
		expect(drop.drop(50, 100 + 5 * 40, from)).toEqual({ kind: "group", list: "soon", date: null, group: "Morning", before: null });
	});

	it("the gap above the first header is the hidden No section", () => {
		const { drop } = setup([item("now", 0, "A", "X")], "left", "now");
		expect(drop.drop(50, 95, drag("soon", item("soon", 0, "S", null)))).toEqual({ kind: "group", list: "now", date: null, group: null, before: null });
	});

	it("the day column of a later day drops into Soon's sections with that day", () => {
		const { drop } = setup([item("soon", 0, "M", "Morning")], "left", "soon", "2026-10-31");
		expect(drop.drop(50, 95, drag("soon", item("soon", 1, "S", null)))).toEqual({ kind: "group", list: "soon", date: "2026-10-31", group: null, before: null });
	});

	it("a finger above the list, over the column's title, still drops into it: on top of the first header", () => {
		const only = item("now", 0, "A", "X");
		const { drop } = setup([only], "left", "now");
		const from = drag("left", only);
		expect(drop.hitTest(50, 60, from)).toBe(true);
		expect(drop.drop(50, 60, from)).toEqual({ kind: "group", list: "now", date: null, group: null, before: null });
		expect(drop.hitTest(50, 20, from)).toBe(false);
	});

	it("the left column of a past day keeps listBefore", () => {
		const a = item("now", 0, "A", null);
		const { drop } = setup([a, item("now", 1, "B", null)], "left", null);
		expect(drop.drop(50, 101, drag("left", item("now", 1, "B", null)))).toEqual({ kind: "listBefore", before: a.key, column: "left" });
	});
});
