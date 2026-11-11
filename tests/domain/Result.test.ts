import { describe, expect, it } from "vitest";
import { normalize } from "../../core/domain/normalize";
import { addToResult, createInPlace, createSubtask, newResult, rename, setResult, setStatus } from "../../core/domain/operations";
import { DayBoundary } from "../../core/domain/DayBoundary";
import { holds, nextStep, resultAbove, resultOfText, usableResultMark, withoutResultMark } from "../../core/domain/Result";
import { flatten, TaskDocument, type TaskEntry } from "../../core/domain/TaskDocument";
import { formatTaskLine, type Markers, parseTaskLine } from "../../core/domain/TaskLine";

const M: Markers = { dueDate: "📅", slot: "⏰", repeat: "🔁", collapsed: "📁", result: "🎯", priorities: ["p1"], labelTag: "label", labels: ["Важное"] };
const SECTIONS = { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done" };
const T = "2026-11-11";

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

function settled(doc: TaskDocument): string {
	return normalize(doc, T).serialize().replace(/\n\n+/g, "\n");
}

function named(doc: TaskDocument, text: string): TaskEntry {
	const entry = flatten(doc.allTasks()).find((e) => e.task.text === text);
	if (!entry) throw new Error(`no task ${text}`);
	return entry;
}

describe("the result mark on a line", () => {
	it("is the first word, before a priority's prefix, and never part of the text", () => {
		expect(parseTaskLine("- [ ] 🎯 p1 Компания в Белграде 📁 🗂️ [[Окружение в Сербии]]", M)!.task).toMatchObject({ result: true, priority: "p1", text: "Компания в Белграде", collapsed: true, project: "Окружение в Сербии" });
		expect(parseTaskLine("- [ ] 🎯 Компания", M)!.task).toMatchObject({ result: true, priority: null, text: "Компания" });
		expect(parseTaskLine("- [x] 🎯 Компания", M)!.task).toMatchObject({ result: true, status: "done" });
	});

	it("reads only a whole first word followed by a space", () => {
		expect(parseTaskLine("- [ ] 🎯Компания", M)!.task).toMatchObject({ result: false, text: "🎯Компания" });
		expect(parseTaskLine("- [ ] p1 🎯 Компания", M)!.task).toMatchObject({ result: false, priority: "p1", text: "🎯 Компания" });
		expect(parseTaskLine("- [ ] Цель 🎯 Компания", M)!.task).toMatchObject({ result: false, text: "Цель 🎯 Компания" });
		expect(parseTaskLine("- [ ] 🎯", M)!.task).toMatchObject({ result: false, text: "🎯" });
	});

	it("is text when the settings have no mark", () => {
		expect(parseTaskLine("- [ ] 🎯 Компания", { ...M, result: undefined })!.task).toMatchObject({ result: false, text: "🎯 Компания" });
	});

	it("is written first, before the priority, and reads back the same", () => {
		const line = "- [ ] 🎯 p1 Компания 🗂️ [[Сербия]] 📁 📅 2026-11-12";
		expect(formatTaskLine(parseTaskLine(line, M)!, M)).toBe(line);
		const made = parseTaskLine("- [ ] Компания", M)!;
		expect(formatTaskLine({ ...made, task: { ...made.task, result: true } }, M)).toBe("- [ ] 🎯 Компания");
	});

	it("reads a subtask as a result too", () => {
		const doc = parse("## Now\n- [ ] A\n\t- [ ] 🎯 B\n\t\t- [ ] C\n## Done\n");
		expect(named(doc, "B").task.result).toBe(true);
	});
});

describe("the mark a setting may give", () => {
	it("is one word that is no priority's prefix", () => {
		expect(usableResultMark("🎯", ["p1"])).toBe("🎯");
		expect(usableResultMark("", ["p1"])).toBeNull();
		expect(usableResultMark("two words", ["p1"])).toBeNull();
		expect(usableResultMark("p1", ["p1"])).toBeNull();
	});

	it("reads a typed title without its mark", () => {
		expect(resultOfText("🎯 A b", "🎯")).toEqual({ result: true, text: "A b" });
		expect(resultOfText("🎯 A", null)).toEqual({ result: false, text: "🎯 A" });
		expect(withoutResultMark(" 🎯 ", "🎯")).toBe("");
		expect(withoutResultMark("🎯 p1 A", "🎯")).toBe("p1 A");
		expect(withoutResultMark("🎯 p1 ", "🎯")).toBe("p1 ");
		expect(withoutResultMark("p1 ", "🎯")).toBe("p1 ");
	});
});

describe("Make result and Make task", () => {
	const FILE = "## Now\n- [ ] Trip 📅 2026-11-11\n\t- [x] Compare\n\t- [ ] Seats\n- [ ] Call 📅 2026-11-11\n## Done\n";

	it("puts the mark on and folds a task with an open subtask", () => {
		const doc = parse(FILE);
		expect(settled(setResult(doc, named(doc, "Trip"), true))).toContain("- [ ] 🎯 Trip 📁 📅 2026-11-11\n");
	});

	it("puts only the mark on a task without an open subtask", () => {
		const doc = parse(FILE);
		expect(settled(setResult(doc, named(doc, "Call"), true))).toContain("- [ ] 🎯 Call 📅 2026-11-11\n");
	});

	it("takes the mark off and leaves the fold as it is", () => {
		const doc = parse("## Now\n- [ ] 🎯 Trip 📁 📅 2026-11-11\n\t- [ ] Seats\n## Done\n");
		expect(settled(setResult(doc, named(doc, "Trip"), false))).toContain("- [ ] Trip 📁 📅 2026-11-11\n");
	});

	it("keeps a result through a rename, and the mark typed first makes one, never staying in the text", () => {
		const doc = parse("## Now\n- [ ] 🎯 p1 Trip 📅 2026-11-11\n- [ ] Call 📅 2026-11-11\n## Done\n");
		expect(settled(rename(doc, named(doc, "Trip"), "Journey"))).toContain("- [ ] 🎯 p1 Journey 📅");
		expect(settled(rename(doc, named(doc, "Call"), "🎯 Ring"))).toContain("- [ ] 🎯 Ring 📅");
	});

	it("writes a new task typed with the mark as a result", () => {
		const doc = parse("## Now\n## Soon\n## Done\n");
		const made = createInPlace(doc, "🎯 p1 Goal", null, { kind: "list", list: "soon", group: null, before: null, date: null }, T, DayBoundary.MIDNIGHT);
		expect(settled(made)).toContain("- [ ] 🎯 p1 Goal\n");
	});

	it("keeps the mark on a closed result and on a repeating result's next copy", () => {
		const doc = parse("## Now\n- [ ] 🎯 Goal 📅 2026-11-11 🔁 every day\n## Soon\n## Done\n");
		const after = settled(setStatus(doc, named(doc, "Goal"), "done"));
		expect(after).toContain("- [x] 🎯 Goal 📅 2026-11-11");
		expect(after).toContain("- [ ] 🎯 Goal 📅 2026-11-12 🔁 every day");
	});
});

describe("the step a result shows", () => {
	it("is its first open subtask, then that one's first open one, down", () => {
		const doc = parse("## Now\n- [ ] 🎯 R\n\t- [x] A\n\t- [ ] B\n\t\t- [x] B1\n\t\t- [ ] B2\n\t- [ ] C\n## Done\n");
		expect(nextStep(named(doc, "R"))!.task.text).toBe("B2");
		expect(nextStep(named(doc, "C"))).toBeNull();
	});

	it("is the result a task is nearest a step of", () => {
		const doc = parse("## Now\n- [ ] 🎯 R\n\t- [ ] A\n\t\t- [ ] 🎯 S\n\t\t\t- [ ] B\n- [ ] Plain\n## Done\n");
		expect(resultAbove(doc, named(doc, "A"))!.task.text).toBe("R");
		expect(resultAbove(doc, named(doc, "B"))!.task.text).toBe("S");
		expect(resultAbove(doc, named(doc, "S"))!.task.text).toBe("R");
		expect(resultAbove(doc, named(doc, "R"))).toBeNull();
		expect(holds(named(doc, "R"), named(doc, "B"))).toBe(true);
		expect(holds(named(doc, "A"), named(doc, "Plain"))).toBe(false);
	});
});

describe("Add to result", () => {
	const FILE = [
		"## Inbox",
		"- [ ] Call bank 🗂️ [[Деньги]]",
		"\t- [ ] Find number",
		"## Now",
		"- [ ] Pay rent 📅 2026-11-11",
		"## Soon",
		"- [ ] 🎯 Компания 🗂️ [[Сербия]]",
		"\t- [ ] Register",
		"## Backlog",
		"- [ ] 🎯 Empty",
		"## Done",
		"",
	].join("\n");

	it("moves the task with its subtasks to the end of the result's, takes the result's project and folds the result", () => {
		const doc = parse(FILE);
		const after = settled(addToResult(doc, [named(doc, "Call bank")], named(doc, "Компания")));
		expect(after).toBe(["## Inbox", "## Now", "- [ ] Pay rent 📅 2026-11-11", "## Soon", "- [ ] 🎯 Компания 🗂️ [[Сербия]] 📁", "\t- [ ] Register", "\t- [ ] Call bank", "\t\t- [ ] Find number", "## Backlog", "- [ ] 🎯 Empty", "## Done", ""].join("\n"));
	});

	it("moves several in file order, a subtask of a moved one going along", () => {
		const doc = parse(FILE);
		const after = settled(addToResult(doc, [named(doc, "Pay rent"), named(doc, "Find number"), named(doc, "Call bank")], named(doc, "Empty")));
		expect(after).toContain(["- [ ] 🎯 Empty 📁", "\t- [ ] Call bank", "\t\t- [ ] Find number", "\t- [ ] Pay rent 📅 2026-11-11"].join("\n"));
	});

	it("leaves a task already a step of the result, and the result itself, where they are", () => {
		const doc = parse(FILE);
		expect(addToResult(doc, [named(doc, "Register")], named(doc, "Компания"))).toBe(doc);
		expect(addToResult(doc, [named(doc, "Компания")], named(doc, "Компания"))).toBe(doc);
	});

	it("moves a step of another result to this one", () => {
		const doc = parse(FILE);
		const after = settled(addToResult(doc, [named(doc, "Register")], named(doc, "Empty")));
		expect(after).toContain("- [ ] 🎯 Компания 🗂️ [[Сербия]]\n## Backlog\n- [ ] 🎯 Empty 📁\n\t- [ ] Register\n");
	});
});

describe("New result…", () => {
	it("writes a result at the task's place, with its project and due date, the task its only step, folded", () => {
		const doc = parse("## Now\n- [ ] A 📅 2026-11-11\n- [ ] Pay rent 🗂️ [[Дом]] 📅 2026-11-11\n\t- [ ] Find card\n- [ ] B 📅 2026-11-11\n## Done\n");
		const after = settled(newResult(doc, [named(doc, "Pay rent")], "  p1 Housing  "));
		expect(after).toBe(["## Now", "- [ ] A 📅 2026-11-11", "- [ ] 🎯 p1 Housing 🗂️ [[Дом]] 📁 📅 2026-11-11", "\t- [ ] Pay rent 📅 2026-11-11", "\t\t- [ ] Find card", "- [ ] B 📅 2026-11-11", "## Done", ""].join("\n"));
	});

	it("writes it among the same task's subtasks for a subtask", () => {
		const doc = parse("## Soon\n- [ ] Parent\n\t- [ ] X\n\t- [ ] Y\n## Done\n");
		const after = settled(newResult(doc, [named(doc, "Y")], "Goal"));
		expect(after).toBe("## Soon\n- [ ] Parent\n\t- [ ] X\n\t- [ ] 🎯 Goal 📁\n\t\t- [ ] Y\n## Done\n");
	});

	it("takes several, at the first one's place", () => {
		const doc = parse("## Inbox\n- [ ] Q\n## Soon\n- [ ] P\n## Done\n");
		const after = settled(newResult(doc, [named(doc, "P"), named(doc, "Q")], "Goal"));
		expect(after).toBe("## Inbox\n- [ ] 🎯 Goal 📁\n\t- [ ] Q\n\t- [ ] P\n## Soon\n## Done\n");
	});
});

describe("a step added to a result", () => {
	it("by Add subtask unfolds a folded result as for any task", () => {
		const doc = parse("## Soon\n- [ ] 🎯 R 📁\n\t- [ ] A\n## Done\n");
		const after = settled(createSubtask(doc, named(doc, "R"), { text: "B", priority: null, placement: { kind: "soon" } }, T));
		expect(after).toContain("- [ ] 🎯 R\n\t- [ ] A\n\t- [ ] B\n");
	});
});
