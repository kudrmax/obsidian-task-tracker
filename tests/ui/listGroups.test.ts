import { describe, expect, it } from "vitest";
import type { GroupName, TaskItem } from "../../src/application/contracts";
import { gapPlace, listGaps, listGroups, showsHeaders } from "../../src/ui/listGroups";

let n = 0;
const item = (text: string, group: GroupName): TaskItem => ({
	key: { section: "now", index: n++, path: [], raw: `- [ ] ${text}` },
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

describe("listGroups", () => {
	it("groups consecutive items by their section", () => {
		const groups = listGroups([item("A", null), item("B", "X"), item("C", "X"), item("D", "Y")]);
		expect(groups.map((g) => [g.name, g.items.map((i) => i.text)])).toEqual([[null, ["A"]], ["X", ["B", "C"]], ["Y", ["D"]]]);
	});

	it("no headers without a named group", () => {
		expect(showsHeaders(listGroups([item("A", null), item("B", null)]))).toBe(false);
		expect(showsHeaders(listGroups([]))).toBe(false);
	});

	it("no header when the only group is ungrouped", () => {
		expect(showsHeaders([{ name: null, items: [item("A", null)] }])).toBe(false);
	});

	it("a header when the only group is a section", () => {
		expect(showsHeaders(listGroups([item("A", "Экскурсия")]))).toBe(true);
	});
});

describe("gaps", () => {
	const a = item("A", null);
	const b = item("B", "X");
	const c = item("C", "X");
	const groups = listGroups([a, b, c]);

	it("gapPlace: end of a group is its last gap", () => {
		expect(listGaps(groups, true).map((g) => [g.place.group, g.place.before?.raw ?? null, g.at])).toEqual([
			[null, a.key.raw, 1],
			[null, null, 2],
			["X", b.key.raw, 3],
			["X", c.key.raw, 4],
			["X", null, 5],
		]);
		expect(gapPlace(groups, true, 4)).toEqual({ group: "X", before: null });
	});

	it("gapPlace: the leading gap is the hidden No section", () => {
		const onlyX = listGroups([b, c]);
		expect(listGaps(onlyX, true)[0]).toEqual({ place: { group: null, before: null }, at: 0 });
		expect(gapPlace(onlyX, true, 1)).toEqual({ group: "X", before: b.key });
	});

	it("without headers the gaps are the cards' and the end", () => {
		expect(listGaps(listGroups([a]), false).map((g) => g.at)).toEqual([0, 1]);
	});

	it("the dragged card is no gap, its section stays", () => {
		const gaps = listGaps(listGroups([a, b]), true, b.key);
		expect(gaps.map((g) => [g.place.group, g.place.before?.raw ?? null])).toEqual([
			[null, a.key.raw],
			[null, null],
			["X", null],
		]);
	});
});
