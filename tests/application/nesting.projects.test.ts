import { describe, expect, it } from "vitest";
import { gapAt, gapOfPlace, levelRange, type ListCard, placeOfGap } from "../../core/application/nesting";

const key = (raw: string) => ({ section: "backlog" as const, index: 0, path: [], raw });

describe("places in a list grouped by project", () => {
	const cards: ListCard[] = [
		{ key: key("a"), level: 0, group: "S", project: "P" },
		{ key: key("b"), level: 0, group: "S", project: null },
	];

	it("a header between two projects' cards breaks nesting, even in a section of the same name", () => {
		expect(levelRange(cards, 1, "S", null)).toEqual({ min: 0, max: 0 });
		expect(levelRange(cards, 1, "S", "P")).toEqual({ min: 0, max: 1 });
	});

	it("a gap carries the project's part it is in, and so does what it means", () => {
		const gap = gapAt(cards, 1, 0, [{ group: "S", project: null }], true);
		expect(gap).toEqual({ kind: "gap", index: 1, level: 0, group: "S", project: null });
		expect(placeOfGap(cards, gap)).toEqual({ kind: "task", group: "S", before: key("b"), project: null });
		expect(placeOfGap(cards, { kind: "gap", index: 1, level: 0, group: "S", project: "P" })).toEqual({ kind: "task", group: "S", before: null, project: "P" });
	});

	it("reads a place back in its project's part", () => {
		expect(gapOfPlace(cards, { kind: "task", group: "S", before: null, project: "P" })).toEqual({ kind: "gap", index: 1, level: 0, group: "S", project: "P" });
	});

	it("a plain list's places carry no project", () => {
		const plain: ListCard[] = [{ key: key("a"), level: 0, group: null }];
		expect(placeOfGap(plain, gapAt(plain, 1, 0, [], false))).toEqual({ kind: "task", group: null, before: null });
	});
});
