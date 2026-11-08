import { describe, expect, it } from "vitest";
import { noteTags } from "../../core/domain/NoteTags";

describe("a note's tags, as Obsidian reads them from its text", () => {
	it("the properties' tags as a list", () => {
		expect(noteTags("---\ntitle: X\ntags:\n  - project\n  - \"#work\"\n---\nBody")).toEqual(["#project", "#work"]);
	});

	it("the properties' tags inline, in brackets or bare, and `tag` too", () => {
		expect(noteTags("---\ntags: [project, 'later']\n---\n")).toEqual(["#project", "#later"]);
		expect(noteTags("---\ntags: project work\n---\n")).toEqual(["#project", "#work"]);
		expect(noteTags("---\nTag: project\n---\n")).toEqual(["#project"]);
	});

	it("a #tag in the text, after the properties", () => {
		expect(noteTags("---\ntags: [a]\n---\nSome #project here\n#second")).toEqual(["#a", "#project", "#second"]);
	});

	it("keeps a nested tag whole", () => {
		expect(noteTags("Text #project/sub")).toEqual(["#project/sub"]);
	});

	it("no tag in fenced or inline code, no heading, no number, none inside a word", () => {
		expect(noteTags("```\n#project\n```\n~~~\n#also\n~~~\nUse `#code` here\n# Heading\n#123\nmail#tag\n#real")).toEqual(["#real"]);
	});

	it("reads a text with Windows line ends, and one without properties", () => {
		expect(noteTags("---\r\ntags:\r\n  - project\r\n---\r\nText #more\r\n")).toEqual(["#project", "#more"]);
		expect(noteTags("---\nno end\n#body")).toEqual(["#body"]);
	});
});
