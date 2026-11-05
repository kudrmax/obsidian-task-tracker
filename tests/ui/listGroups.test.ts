import { describe, expect, it } from "vitest";
import type { GroupName, TaskItem } from "../../src/application/contracts";
import { gapPlace, isEmptyGroup, listGaps, listGroups, showsHeaders, withEmptySections } from "../../src/ui/listGroups";
import { onDay } from "../fakes/itemOnDay";

let n = 0;
const item = (text: string, group: GroupName): TaskItem => onDay({
	key: { section: "now", index: n++, path: [], raw: `- [ ] ${text}` },
	text,
	status: "todo",
	dueDate: null,
	slot: null,
	reminder: "notification",
	repeat: null,
	open: true,
	repeatable: true,
	priority: null,
	group,
	subtasks: [],
	progress: null,
	parentText: null, description: null,
	list: "now",
	isSubtask: false,
}, "2026-11-01");

describe("listGroups", () => {
	it("groups consecutive items by their section", () => {
		const groups = listGroups([item("A", null), item("B", "X"), item("C", "X"), item("D", "Y")]);
		expect(groups.map((g) => [g.name, g.items.map((i) => i.text)])).toEqual([[null, ["A"]], ["X", ["B", "C"]], ["Y", ["D"]]]);
	});

	it("gathers a section's tasks where it first shows: a later day lists Now's tasks before Soon's", () => {
		const groups = listGroups([item("N", null), item("A", null), item("M", "Morning"), item("B", null)]);
		expect(groups.map((g) => [g.name, g.items.map((i) => i.text)])).toEqual([[null, ["N", "A", "B"]], ["Morning", ["M"]]]);
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

describe("withEmptySections", () => {
	const sections = (...names: [GroupName, boolean][]) => names.map(([name, empty]) => ({ name, empty }));

	it("puts an empty section where it stands in the file, after the group drawn above it", () => {
		const groups = listGroups([item("A", null), item("B", "Evening")]);
		const drawn = withEmptySections(groups, sections([null, false], ["Morning", true], ["Evening", false], ["Later", true]));
		expect(drawn.map((g) => [g.name, g.items.length])).toEqual([[null, 1], ["Morning", 0], ["Evening", 1], ["Later", 0]]);
	});

	it("an empty section first in the file comes first; one section, empty, turns the headers on", () => {
		const drawn = withEmptySections(listGroups([item("A", null)]), sections(["Morning", true], [null, false]));
		expect(drawn.map((g) => g.name)).toEqual(["Morning", null]);
		expect(showsHeaders(drawn)).toBe(true);
		expect(isEmptyGroup(drawn[0])).toBe(true);
		expect(isEmptyGroup(drawn[1])).toBe(false);
	});

	it("a section with tasks the column does not show stays out", () => {
		expect(withEmptySections(listGroups([item("A", null)]), sections([null, false], ["Evening", false]))).toHaveLength(1);
	});

	it("an empty section's one gap is its end", () => {
		const a = item("A", null);
		const drawn = withEmptySections(listGroups([a]), sections([null, false], ["Evening", true]));
		expect(listGaps(drawn, true).map((g) => g.place)).toEqual([
			{ group: null, before: a.key },
			{ group: null, before: null },
			{ group: "Evening", before: null },
		]);
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

	it("a dragged subtask takes no gap from its task", () => {
		const gaps = listGaps(listGroups([a, b]), true, { ...b.key, path: [0] });
		expect(gaps.map((g) => g.place.before?.raw ?? null)).toContain(b.key.raw);
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
