import { describe, expect, it } from "vitest";
import { type GroupName, listView, type TaskItem } from "../../src/application/contracts";
import { gapPlace, isEmptyGroup, listGaps } from "../../src/ui/listGroups";

/** A list that shows sections, in its sections. */
const listGroups = (items: readonly TaskItem[]) => listView(items, true).groups;
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

describe("an empty section", () => {
	const sections = (...names: [GroupName, boolean][]) => names.map(([name, empty]) => ({ name, empty }));

	it("is drawn over the No tasks plate; a group with tasks is not", () => {
		const drawn = listView([item("A", null)], true, sections(["Morning", true], [null, false])).groups;
		expect(isEmptyGroup(drawn[0])).toBe(true);
		expect(isEmptyGroup(drawn[1])).toBe(false);
	});

	it("has one gap, its end", () => {
		const a = item("A", null);
		const drawn = listView([a], true, sections([null, false], ["Evening", true])).groups;
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
