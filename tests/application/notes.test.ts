import { describe, expect, it } from "vitest";
import { linkQuery, noteOfLink, noteSuggestions, withNoteLink } from "../../core/application/notes";

const VAULT = [
	{ path: "Projects/Alpha.md" },
	{ path: "Archive/Alpha.md" },
	{ path: "Beta.md" },
	{ path: "Gamma.md" },
	{ path: "Notes/Alphabet soup.md" },
	{ path: "Images/alpha.png" },
	{ path: "Daily/2026-11-08.md" },
];

describe("a `[[` typed in a title", () => {
	it("is found up to the caret, on its line, not closed before it", () => {
		expect(linkQuery("Call [[Alp", 10)).toEqual({ query: "Alp", from: 5, to: 10 });
		expect(linkQuery("Call [[Alp]] now", 10)).toEqual({ query: "Alp", from: 5, to: 12 });
		expect(linkQuery("Call [[Alpha]] now", 18)).toBeNull();
		expect(linkQuery("Call [[Alpha|al", 15)).toBeNull();
		expect(linkQuery("Call [Alp", 9)).toBeNull();
	});

	it("offers the notes by name first, then by path, the shorter name first, all of them A–Z for nothing typed", () => {
		expect(noteSuggestions("alpha", VAULT).map((n) => n.path)).toEqual(["Archive/Alpha.md", "Projects/Alpha.md", "Images/alpha.png", "Notes/Alphabet soup.md"]);
		expect(noteSuggestions("projects alp", VAULT).map((n) => n.link)).toEqual(["Projects/Alpha"]);
		expect(noteSuggestions("daily", VAULT)).toEqual([{ name: "2026-11-08", path: "Daily/2026-11-08.md", link: "2026-11-08" }]);
		expect(noteSuggestions("", VAULT, 3).map((n) => n.name)).toEqual(["2026-11-08", "Alpha", "Alpha"]);
	});

	it("is replaced by the picked note's link, the caret after it", () => {
		expect(withNoteLink("Call [[Alp now", { query: "Alp", from: 5, to: 10 }, "Projects/Alpha")).toEqual({ text: "Call [[Projects/Alpha]] now", caret: 23 });
		expect(withNoteLink("Call [[Alp]]", { query: "Alp", from: 5, to: 12 }, "Beta")).toEqual({ text: "Call [[Beta]]", caret: 13 });
	});
});

describe("the note a link in a title opens", () => {
	it("is found by its path, else by its name, a heading left aside", () => {
		expect(noteOfLink("Projects/Alpha#Plan", VAULT)?.path).toBe("Projects/Alpha.md");
		expect(noteOfLink("Beta", VAULT)?.path).toBe("Beta.md");
		expect(noteOfLink("beta.md", VAULT)?.path).toBe("Beta.md");
		expect(noteOfLink("Alphabet soup", VAULT)?.path).toBe("Notes/Alphabet soup.md");
		expect(noteOfLink("Missing", VAULT)).toBeNull();
		expect(noteOfLink("#Heading", VAULT)).toBeNull();
	});
});
