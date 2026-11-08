import { describe, expect, it } from "vitest";
import { linkQuery, noteOfLink, noteSuggestions, noteTags, vaultProjects, withNoteLink } from "../../core/application/notes";

describe("a note's tags, as Obsidian reads them", () => {
	it("reads the properties' tags as a list, in brackets or as words, `#` or not", () => {
		expect(noteTags("---\ntags:\n  - project\n  - \"#work/alpha\"\nstatus: open\n---\nText")).toEqual(["#project", "#work/alpha"]);
		expect(noteTags("---\ntags: [project, home]\n---\n")).toEqual(["#project", "#home"]);
		expect(noteTags("---\nTag: project home\n---\n")).toEqual(["#project", "#home"]);
	});

	it("reads `#tag` in the text after a space or the line's start, outside code", () => {
		expect(noteTags("Plan #project and #2026 and a#b\n```\n#code\n```\n`#span` #Проект/план, [[Note#Heading]]\n# Heading")).toEqual(["#project", "#Проект/план"]);
	});

	it("names each tag once, the properties' first", () => {
		expect(noteTags("---\ntags: project\n---\n#project #next")).toEqual(["#project", "#next"]);
	});

	it("reads no properties that do not open the note", () => {
		expect(noteTags("Intro\n---\ntags: project\n---\n")).toEqual([]);
	});
});

const VAULT = [
	{ path: "Projects/Alpha.md", tags: ["#project"] },
	{ path: "Archive/Alpha.md", tags: ["#project"] },
	{ path: "Beta.md", tags: ["#Project"] },
	{ path: "Gamma.md", tags: ["#project/sub"] },
	{ path: "Notes/Alphabet soup.md" },
	{ path: "Images/alpha.png" },
	{ path: "Daily/2026-11-08.md" },
];

describe("the vault's projects", () => {
	it("are the notes with exactly the project tag, by name, each linked as Obsidian links it: its name while no other note has it", () => {
		expect(vaultProjects(VAULT, "#project")).toEqual([
			{ name: "Alpha", path: "Archive/Alpha.md", link: "Archive/Alpha" },
			{ name: "Alpha", path: "Projects/Alpha.md", link: "Projects/Alpha" },
			{ name: "Beta", path: "Beta.md", link: "Beta" },
		]);
	});

	it("are none for a tag no note has", () => {
		expect(vaultProjects(VAULT, "#client")).toEqual([]);
	});
});

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
