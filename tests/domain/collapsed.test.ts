import { describe, expect, it } from "vitest";
import { normalize } from "../../core/domain/normalize";
import { createInPlace, createSubtask, moveToSoon, nest, remove, setCollapsed, setSlot, setStatus, unfoldAbove } from "../../core/domain/operations";
import { DayBoundary } from "../../core/domain/DayBoundary";
import { TaskDocument } from "../../core/domain/TaskDocument";
import { formatTaskLine, type Markers, parseTaskLine } from "../../core/domain/TaskLine";

const M: Markers = { dueDate: "📅", slot: "⏰", repeat: "🔁", collapsed: "📁", priorities: ["p1"], labelTag: "label", labels: ["Важное"] };
const SECTIONS = { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done" };
const T = "2026-10-30";
const TRIP = "## Now\n- [ ] Trip 📁 📅 2026-10-30\n\t- [x] Compare\n\t- [ ] Seats\n\t\t- [ ] Window\n- [ ] Call\n## Soon\n- [ ] Later\n## Done\n";

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

/** The file as normalizing leaves it, without the blank lines it spaces the headings with. */
function settled(doc: TaskDocument): string {
	return normalize(doc, T).serialize().replace(/\n\n+/g, "\n");
}

describe("the collapsed marker on a line", () => {
	it("reads the marker among the fields, in any order, and leaves it out of the text", () => {
		expect(parseTaskLine("- [ ] Trip 📁", M)!.task).toMatchObject({ text: "Trip", collapsed: true });
		expect(parseTaskLine("- [ ] Trip 📅 2026-10-30 📁 🔁 every day", M)!.task).toMatchObject({ text: "Trip", dueDate: "2026-10-30", collapsed: true });
		expect(parseTaskLine("- [ ] Trip 📅 2026-10-30", M)!.task.collapsed).toBe(false);
	});

	it("keeps the marker inside the text as text", () => {
		expect(parseTaskLine("- [ ] Папка 📁 с документами", M)!.task).toMatchObject({ text: "Папка 📁 с документами", collapsed: false });
	});

	it("reads the marker as text when the settings have none", () => {
		expect(parseTaskLine("- [ ] Trip 📁", { dueDate: "📅", slot: "⏰" })!.task).toMatchObject({ text: "Trip 📁", collapsed: false });
	});

	it("writes the marker after the text and the labels, before the due date, the slot and the repeat", () => {
		const line = "- [ ] p1 Trip 🔁 every day ⏰ 2026-10-30 10:00 📅 2026-10-30 📁";
		expect(formatTaskLine(parseTaskLine(line, M)!, M)).toBe("- [ ] p1 Trip 📁 📅 2026-10-30 ⏰ 2026-10-30 10:00 🔁 every day");
		const labelled = "- [ ] Trip 📁 #label/Важное";
		expect(formatTaskLine(parseTaskLine(labelled, M)!, M)).toBe("- [ ] Trip #label/Важное 📁");
	});

	it("follows a custom marker", () => {
		const custom = { ...M, collapsed: "[-]" };
		const parsed = parseTaskLine("- [ ] Trip [-] 📅 2026-10-30", custom)!;
		expect(parsed.task).toMatchObject({ text: "Trip", collapsed: true });
		expect(formatTaskLine(parsed, custom)).toBe("- [ ] Trip [-] 📅 2026-10-30");
	});

	it("round-trips the file byte for byte", () => {
		expect(parse(TRIP).serialize()).toBe(TRIP);
	});
});

describe("folding a task", () => {
	it("folds a task with an open subtask and unfolds it again", () => {
		const doc = parse("## Now\n- [ ] Trip\n\t- [ ] Seats\n");
		const folded = setCollapsed(doc, doc.tasks("now")[0], true);
		expect(folded.serialize()).toBe("## Now\n- [ ] Trip 📁\n\t- [ ] Seats\n");
		expect(setCollapsed(folded, folded.tasks("now")[0], false).serialize()).toBe("## Now\n- [ ] Trip\n\t- [ ] Seats\n");
	});

	it("does not fold a task with no open subtask", () => {
		for (const text of ["## Now\n- [ ] Trip\n", "## Now\n- [ ] Trip\n\t- [x] Seats\n\t- [-] Bus\n", "## Now\n- [ ] Trip\n\tjust a note\n"]) {
			const doc = parse(text);
			expect(setCollapsed(doc, doc.tasks("now")[0], true).serialize()).toBe(text);
		}
	});

	it("folds a subtask with subtasks of its own", () => {
		const doc = parse(TRIP);
		const seats = doc.tasks("now")[0].subtasks[1];
		expect(setCollapsed(doc, seats, true).serialize()).toContain("\t- [ ] Seats 📁\n\t\t- [ ] Window\n");
	});

	it("unfolds every task above a subtask, so its card is drawn", () => {
		const doc = parse("## Now\n- [ ] Trip 📁\n\t- [ ] Seats 📁\n\t\t- [ ] Window\n");
		const window = doc.tasks("now")[0].subtasks[0].subtasks[0];
		expect(unfoldAbove(doc, window).serialize()).toBe("## Now\n- [ ] Trip\n\t- [ ] Seats\n\t\t- [ ] Window\n");
		expect(unfoldAbove(doc, doc.tasks("now")[0]).serialize()).toBe(doc.serialize());
	});
});

describe("a folded task given a subtask unfolds", () => {
	const draft = { text: "Bag", placement: { kind: "now" as const }, priority: null };

	it("on a new subtask from the task screen", () => {
		const doc = parse("## Now\n- [ ] Trip 📁\n\t- [ ] Seats\n");
		expect(createSubtask(doc, doc.tasks("now")[0], draft, T).serialize()).toBe("## Now\n- [ ] Trip\n\t- [ ] Seats\n\t- [ ] Bag\n");
	});

	it("on a new subtask typed in place, before another one", () => {
		const doc = parse("## Now\n- [ ] Trip 📁\n\t- [ ] Seats\n");
		const trip = doc.tasks("now")[0];
		const out = createInPlace(doc, "Bag", null, { kind: "subtask", parent: trip, before: trip.subtasks[0] }, T, DayBoundary.MIDNIGHT);
		expect(out.serialize()).toBe("## Now\n- [ ] Trip\n\t- [ ] Bag\n\t- [ ] Seats\n");
	});

	it("on a task dragged under it, from above or below", () => {
		const below = parse("## Now\n- [ ] Trip 📁\n\t- [ ] Seats\n- [ ] Bag\n");
		expect(nest(below, below.tasks("now")[1], below.tasks("now")[0], null).serialize()).toBe("## Now\n- [ ] Trip\n\t- [ ] Seats\n\t- [ ] Bag\n");
		const above = parse("## Now\n- [ ] Bag\n- [ ] Trip 📁\n\t- [ ] Seats\n");
		const trip = above.tasks("now")[1];
		expect(nest(above, above.tasks("now")[0], trip, trip.subtasks[0]).serialize()).toBe("## Now\n- [ ] Trip\n\t- [ ] Bag\n\t- [ ] Seats\n");
	});
});

describe("normalizing takes the marker off a task with nothing to fold", () => {
	it("when the last open subtask is done or given up", () => {
		const doc = parse("## Now\n- [ ] Trip 📁\n\t- [x] Compare\n\t- [ ] Seats\n");
		const done = setStatus(doc, doc.tasks("now")[0].subtasks[1], "done");
		expect(settled(done)).toBe("## Now\n- [ ] Trip\n\t- [x] Compare\n\t- [x] Seats\n");
		const cancelled = setStatus(doc, doc.tasks("now")[0].subtasks[1], "cancelled");
		expect(settled(cancelled)).toBe("## Now\n- [ ] Trip\n\t- [x] Compare\n\t- [-] Seats\n");
	});

	it("when the last subtask is deleted, or moved out of it", () => {
		const doc = parse("## Now\n- [ ] Trip 📁\n\t- [ ] Seats\n## Soon\n");
		expect(settled(remove(doc, doc.tasks("now")[0].subtasks[0]))).toBe("## Now\n- [ ] Trip\n## Soon\n");
		expect(settled(moveToSoon(doc, doc.tasks("now")[0].subtasks[0], T, T))).toBe("## Now\n- [ ] Trip\n## Soon\n- [ ] Seats\n");
		const slotted = setSlot(doc, doc.tasks("now")[0].subtasks[0], { date: T, start: 600, end: 660 }, T);
		expect(settled(slotted)).toBe("## Now\n- [ ] Trip\n- [ ] Seats ⏰ 2026-10-30 10:00-11:00\n## Soon\n");
	});

	it("when the subtasks were taken away by hand in the file", () => {
		expect(settled(parse("## Now\n- [ ] Trip 📁\n- [ ] Call 📁 📅 2026-10-30\n"))).toBe("## Now\n- [ ] Trip\n- [ ] Call 📅 2026-10-30\n");
	});

	it("at any depth, and in Done too", () => {
		const text = "## Now\n- [ ] Trip 📁\n\t- [ ] Seats 📁\n\t\t- [x] Window\n## Done\n- [x] Old 📁\n\t- [x] Step\n";
		expect(settled(parse(text))).toBe("## Now\n- [ ] Trip 📁\n\t- [ ] Seats\n\t\t- [x] Window\n## Done\n- [x] Old\n\t- [x] Step\n");
	});

	it("but leaves a task with an open subtask folded", () => {
		const text = "## Now\n- [ ] Trip 📁\n\t- [x] Compare\n\t- [/] Seats\n## Done\n- [x] Old 📁\n\t- [ ] Step\n";
		expect(settled(parse(text))).toBe(text);
	});
});

describe("a folded task stays folded wherever it goes", () => {
	it("moved to another list, put on a time, or done with its subtasks", () => {
		const doc = parse(TRIP);
		const trip = doc.tasks("now")[0];
		expect(settled(moveToSoon(doc, trip, T, T))).toContain("## Soon\n- [ ] Later\n- [ ] Trip 📁\n\t- [x] Compare\n");
		expect(settled(setSlot(doc, trip, { date: T, start: 600, end: 660 }, T))).toContain("- [ ] Trip 📁 📅 2026-10-30 ⏰ 2026-10-30 10:00-11:00\n");
		expect(settled(setStatus(doc, trip, "done"))).toContain("## Done\n- [x] Trip 📁 📅 2026-10-30\n\t- [x] Compare\n\t- [ ] Seats\n");
	});

	it("as the next copy of a repeating task, whose subtasks open again", () => {
		const doc = parse("## Now\n- [ ] Gym 📁 📅 2026-10-30 🔁 every day\n\t- [x] Warm up\n## Soon\n## Done\n");
		const out = settled(setStatus(doc, doc.tasks("now")[0], "done"));
		expect(out).toContain("## Soon\n- [ ] Gym 📁 📅 2026-10-31 🔁 every day\n\t- [ ] Warm up\n");
		expect(out).toContain("## Done\n- [x] Gym 📅 2026-10-30\n\t- [x] Warm up\n");
	});
});
