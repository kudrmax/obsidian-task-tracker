import { describe, expect, it } from "vitest";
import { CONTEXT_PREFIX, contextLine, descriptionMarkdown, withContext } from "../../core/domain/description";
import { addContext } from "../../core/domain/operations";
import { TaskDocument } from "../../core/domain/TaskDocument";

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { inbox: "Inbox", now: "Now", soon: "Soon", done: "Done" };

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

describe("a context line Max adds to a task", () => {
	it("is a top-level point with the prefix, the text trimmed and its breaks and runs of spaces joined", () => {
		expect(CONTEXT_PREFIX).toBe("Контекст: ");
		expect(contextLine("  I'm already signed up\n to five   events,\r\n\tthis is the sixth  ")).toBe("- Контекст: I'm already signed up to five events, this is the sixth");
	});

	it("is none for a blank text", () => {
		expect(contextLine(" \n\t ")).toBeNull();
		expect(withContext("- a", "  ")).toBeNull();
	});

	it("starts a description of its own when there is none", () => {
		expect(withContext(null, "Small one")).toBe("- Контекст: Small one");
	});

	it("goes after the description's last line, a nested one too", () => {
		expect(withContext("- a\n\t- b", "Small one")).toBe("- a\n\t- b\n- Контекст: Small one");
	});

	it("is written into the file under the task, after its description and before its subtasks; each save adds a line at the end", () => {
		const doc = parse(["## Now", "- [ ] Sign up", "\t- [ ] Pick a day", "\t- Old note", "- [ ] Other", "", "## Soon", "", "## Done", ""].join("\n"));
		const once = addContext(doc, doc.tasks("now")[0], "Sixth one");
		const twice = addContext(once, once.tasks("now")[0], "Takes a minute");
		expect(twice.serialize()).toContain("- [ ] Sign up\n\t- Old note\n\t- Контекст: Sixth one\n\t- Контекст: Takes a minute\n\t- [ ] Pick a day\n- [ ] Other");
		expect(descriptionMarkdown(twice.tasks("now")[0])).toBe("- Old note\n- Контекст: Sixth one\n- Контекст: Takes a minute");
	});

	it("writes nothing for a blank text", () => {
		const doc = parse(["## Now", "- [ ] Sign up", "", "## Soon", "", "## Done", ""].join("\n"));
		expect(addContext(doc, doc.tasks("now")[0], " ")).toBe(doc);
	});
});
