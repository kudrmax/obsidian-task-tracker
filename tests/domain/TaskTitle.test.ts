import { describe, expect, it } from "vitest";
import { DayBoundary } from "../../core/domain/DayBoundary";
import { createAtTime, createInList, createInPlace, createInSoon, createSubtask, placeTask, rename } from "../../core/domain/operations";
import { oneLine, taskTitle } from "../../core/domain/TaskTitle";
import { TaskDocument } from "../../core/domain/TaskDocument";

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done" };
const T = "2026-10-30";
const BROKEN = "Позвонить [[Петя]]\n  про договор";
const ONE_LINE = "Позвонить [[Петя]] про договор";

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

describe("oneLine", () => {
	it("reads every kind of line break, with the spaces around it, as one space, and leaves the rest as typed", () => {
		for (const brk of ["\n", "\r\n", "\r", "\u2028", "\u2029", " \n\n "]) expect(oneLine(`a${brk}b`)).toBe("a b");
		expect(oneLine("p1 ")).toBe("p1 ");
	});
});

describe("taskTitle", () => {
	it("is the text on one line, trimmed", () => {
		expect(taskTitle(`\n ${BROKEN}\r\n`)).toBe(ONE_LINE);
	});
});

describe("a title written into the file stays on one line", () => {
	const BASE = "## Inbox\n\n## Now\n- [ ] A\n\n## Soon\n\n## Done\n";
	const hasOneLine = (doc: TaskDocument) => expect(doc.serialize()).toContain(`] ${ONE_LINE}`);

	it("when created in a list, in Soon, at a time or in place", () => {
		hasOneLine(createInList(parse(BASE), T, T, BROKEN));
		hasOneLine(createInSoon(parse(BASE), BROKEN));
		hasOneLine(createAtTime(parse(BASE), T, T, 600, BROKEN));
		hasOneLine(createInPlace(parse(BASE), BROKEN, null, { kind: "list", list: "inbox", group: null, before: null, date: null }, T, DayBoundary.MIDNIGHT));
		expect(createInSoon(parse(BASE), BROKEN).serialize()).toBe(`## Inbox\n\n## Now\n- [ ] A\n\n## Soon\n- [ ] ${ONE_LINE}\n\n## Done\n`);
	});

	it("when created as a subtask", () => {
		const doc = parse(BASE);
		hasOneLine(createSubtask(doc, doc.tasks("now")[0], { text: BROKEN, placement: { kind: "now" }, priority: null }, T));
		hasOneLine(createInPlace(doc, BROKEN, null, { kind: "subtask", parent: doc.tasks("now")[0], before: null }, T, DayBoundary.MIDNIGHT));
	});

	it("when renamed or edited", () => {
		const doc = parse(BASE);
		expect(rename(doc, doc.tasks("now")[0], BROKEN).serialize()).toBe(`## Inbox\n\n## Now\n- [ ] ${ONE_LINE}\n\n## Soon\n\n## Done\n`);
		hasOneLine(placeTask(doc, doc.tasks("now")[0], { text: BROKEN, placement: { kind: "now" }, priority: null }, T));
		hasOneLine(placeTask(doc, null, { text: BROKEN, placement: { kind: "soon" }, priority: null }, T));
	});

	it("when an edited subtask keeps its place", () => {
		const doc = parse("## Now\n- [ ] A\n    - [ ] B\n\n## Soon\n");
		const sub = doc.find("now", 0, [0])!;
		expect(placeTask(doc, sub, { text: BROKEN, placement: { kind: "now" }, priority: null }, T).serialize()).toContain(`    - [ ] ${ONE_LINE}`);
	});
});

describe("a title never starts as a line of its own kind", () => {
	it("loses a list, checkbox, heading or quote marker at its start, however many", () => {
		for (const typed of ["- [ ] **word**[]()", "- [ ] - [ ] **word**[]()", "* **word**[]()", "1. **word**[]()", "2) **word**[]()", "[x] **word**[]()", "## **word**[]()", "> **word**[]()", " - **word**[]() "]) {
			expect(taskTitle(typed)).toBe("**word**[]()");
		}
	});

	it("keeps a tag, inline marks, links and a marker in its middle", () => {
		for (const title of ["#home cleanup", "**bold** and _it_", "[[Note]] - [ ] later", "Buy 2. milk", "-5 degrees"]) expect(taskTitle(title)).toBe(title);
	});

	it("is written so when created or renamed", () => {
		const doc = parse("## Inbox\n\n## Now\n- [ ] A\n\n## Soon\n\n## Done\n");
		expect(rename(doc, doc.tasks("now")[0], "- [ ] **word**").serialize()).toContain("## Now\n- [ ] **word**\n");
		expect(createInSoon(doc, "- [ ] B\nC").serialize()).toContain("## Soon\n- [ ] B C\n");
	});
});
