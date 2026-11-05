import { describe, expect, it } from "vitest";
import { findIn, flatDescription, hitIn, snippetIn } from "../../src/domain/search";

describe("findIn", () => {
	it("reads «ё» as «е» and ignores case", () => {
		expect(findIn("Ёлка", "елка")).toEqual({ start: 0, end: 4 });
		expect(findIn("елка", "ЁЛКА")).toEqual({ start: 0, end: 4 });
	});

	it("finds the first place in the text", () => {
		expect(findIn("Продлить загранпаспорт", "ПАСПОРТ")).toEqual({ start: 15, end: 22 });
	});

	it("finds nothing for a query of spaces or a missing word", () => {
		expect(findIn("x", "  ")).toBeNull();
		expect(findIn("x", "y")).toBeNull();
	});
});

describe("hitIn", () => {
	it("cuts the text in three, the match as written in the text", () => {
		expect(hitIn("Сделать копию Паспорта", "паспорт")).toEqual({ before: "Сделать копию ", match: "Паспорт", after: "а" });
	});
});

describe("snippetIn", () => {
	it("flattens a description to one line without list markers", () => {
		expect(flatDescription("- взять\n  - старый\n1. паспорт")).toBe("взять старый паспорт");
	});

	it("keeps a short lead whole", () => {
		expect(snippetIn("взять старый паспорт и фото", "паспорт")).toEqual({ before: "взять старый ", match: "паспорт", after: " и фото" });
	});

	it("cuts a long lead at a word, with an ellipsis", () => {
		const hit = snippetIn("сначала записаться на приём в окно номер пять, потом паспорт", "паспорт")!;
		expect(hit.before.startsWith("…")).toBe(true);
		expect(hit.before.length).toBeLessThanOrEqual(25);
		expect(hit.before.endsWith("потом ")).toBe(true);
		expect(hit.match).toBe("паспорт");
	});
});
