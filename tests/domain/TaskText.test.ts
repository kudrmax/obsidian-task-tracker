import { describe, expect, it } from "vitest";
import { plainText, textParts } from "../../src/domain/TaskText";

describe("textParts", () => {
	it("keeps text without links whole", () => {
		expect(textParts("Купить молоко")).toEqual([{ kind: "text", text: "Купить молоко" }]);
	});

	it("reads a wikilink by its note's name", () => {
		expect(textParts("Прочитать [[Книги/Дюна]] до пятницы")).toEqual([
			{ kind: "text", text: "Прочитать " },
			{ kind: "note", label: "Книги/Дюна", target: "Книги/Дюна" },
			{ kind: "text", text: " до пятницы" },
		]);
	});

	it("shows a wikilink's alias in its place", () => {
		expect(textParts("[[2026-11-01|сегодня]]")).toEqual([{ kind: "note", label: "сегодня", target: "2026-11-01" }]);
	});

	it("shows a heading and a block the way Obsidian does", () => {
		expect(textParts("[[Дюна#Глава 1]]")).toEqual([{ kind: "note", label: "Дюна > Глава 1", target: "Дюна#Глава 1" }]);
		expect(textParts("[[#Итоги]]")).toEqual([{ kind: "note", label: "Итоги", target: "#Итоги" }]);
		expect(textParts("[[Дюна#^abc]]")).toEqual([{ kind: "note", label: "Дюна > ^abc", target: "Дюна#^abc" }]);
	});

	it("reads a markdown link by its word", () => {
		expect(textParts("Ответить [Пете](https://t.me/petya)")).toEqual([
			{ kind: "text", text: "Ответить " },
			{ kind: "url", label: "Пете", target: "https://t.me/petya" },
		]);
	});

	it("reads a markdown link to a note as a note", () => {
		expect(textParts("[план](Работа/План%202026.md)")).toEqual([{ kind: "note", label: "план", target: "Работа/План 2026.md" }]);
		expect(textParts("[план](<Работа/План 2026.md>)")).toEqual([{ kind: "note", label: "план", target: "Работа/План 2026.md" }]);
	});

	it("reads a bare address as a link", () => {
		expect(textParts("Смотреть https://youtu.be/x?t=1, потом")).toEqual([
			{ kind: "text", text: "Смотреть " },
			{ kind: "url", label: "https://youtu.be/x?t=1", target: "https://youtu.be/x?t=1" },
			{ kind: "text", text: ", потом" },
		]);
	});

	it("leaves the rest of the markup as typed", () => {
		expect(textParts("**Важно** #работа `[[код]]` ==да==")).toEqual([{ kind: "text", text: "**Важно** #работа `[[код]]` ==да==" }]);
	});

	it("leaves an embed and an escaped bracket as typed", () => {
		expect(textParts("![[фото.png]] и \\[[не ссылка]]")).toEqual([{ kind: "text", text: "![[фото.png]] и \\[[не ссылка]]" }]);
	});

	it("leaves an empty or unclosed link as typed", () => {
		expect(textParts("[[]] [[открыта [слово]")).toEqual([{ kind: "text", text: "[[]] [[открыта [слово]" }]);
	});
});

describe("plainText", () => {
	it("puts each link's word in its place", () => {
		expect(plainText("Позвонить [[Люди/Петя|Пете]] про [договор](https://x.ru) и [[Дюна]]")).toBe("Позвонить Пете про договор и Дюна");
	});
});
