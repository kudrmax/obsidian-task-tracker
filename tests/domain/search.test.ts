import { describe, expect, it } from "vitest";
import { FuzzyQuery, matchParts, plainDescription, snippetParts } from "../../core/domain/search";

function query(text: string): FuzzyQuery {
	return FuzzyQuery.of(text)!;
}

describe("FuzzyQuery", () => {
	it("finds the query's words in their order, each a part of a word", () => {
		expect(query("Отв эл").match("Ответить Элине")?.found).toEqual([
			{ start: 0, end: 3 },
			{ start: 9, end: 11 },
		]);
	});

	it("failing the words, finds the letters in their order", () => {
		expect(query("отвэл").match("Ответить Элине")?.found).toEqual([
			{ start: 0, end: 3 },
			{ start: 9, end: 11 },
		]);
		expect(query("эл отв").match("Ответить Элине")).toBeNull();
	});

	it("reads «ё» as «е» and ignores case and accents", () => {
		expect(query("елка").match("Ёлка")?.found).toEqual([{ start: 0, end: 4 }]);
		expect(query("ЁЛКА").match("елка")?.found).toEqual([{ start: 0, end: 4 }]);
		expect(query("cafe").match("Café")?.found).toEqual([{ start: 0, end: 4 }]);
	});

	it("finds nothing for a query of spaces", () => {
		expect(FuzzyQuery.of("   ")).toBeNull();
	});

	it("scores whole words above letters scattered, and a word's start above its middle", () => {
		const q = query("пас");
		const word = q.match("Фото на паспорт")!.score;
		const middle = q.match("Компас")!.score;
		const scattered = q.match("Пойти на массаж")!.score;
		expect(word).toBeGreaterThan(middle);
		expect(middle).toBeGreaterThan(scattered);
	});

	it("matchWords leaves the letters alone", () => {
		expect(query("отвэл").matchWords("Ответить Элине")).toBeNull();
		expect(query("отв эл").matchWords("Ответить Элине")).not.toBeNull();
	});
});

describe("matchParts", () => {
	it("cuts the text at the found pieces, as written in the text", () => {
		const text = "Ответить Элине";
		expect(matchParts(text, query("отв эл").match(text)!.found)).toEqual([
			{ text: "Отв", match: true },
			{ text: "етить ", match: false },
			{ text: "Эл", match: true },
			{ text: "ине", match: false },
		]);
	});
});

describe("plainDescription", () => {
	it("reads a description as one line of its words, without list marks", () => {
		expect(plainDescription("- взять\n  - старый\n1. паспорт")).toBe("взять старый паспорт");
	});

	it("drops emphasis, code, quote and heading marks", () => {
		expect(plainDescription("- **важно** сегодня, _очень_ ~~зря~~ ==тут==\n> # `код` и snake_case")).toBe("важно сегодня, очень зря тут код и snake_case");
	});

	it("reads links by their words and drops embeds", () => {
		expect(plainDescription("- см. [[Заметка|план]] и [сайт](https://x.ru) ![[фото.png]]")).toBe("см. план и сайт");
	});
});

describe("snippetParts", () => {
	it("keeps a short lead whole", () => {
		const text = "взять старый паспорт и фото";
		expect(snippetParts(text, query("паспорт").match(text)!.found)).toEqual([
			{ text: "взять старый ", match: false },
			{ text: "паспорт", match: true },
			{ text: " и фото", match: false },
		]);
	});

	it("cuts a long lead at a word, with an ellipsis", () => {
		const text = "сначала записаться на приём в окно номер пять, потом паспорт";
		const [lead, match] = snippetParts(text, query("паспорт").match(text)!.found);
		expect(lead.text.startsWith("…")).toBe(true);
		expect(lead.text.length).toBeLessThanOrEqual(25);
		expect(lead.text.endsWith("потом ")).toBe(true);
		expect(match).toEqual({ text: "паспорт", match: true });
	});
});
