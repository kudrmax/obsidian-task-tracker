import { describe, expect, it } from "vitest";
import { DayBoundary } from "../../core/domain/DayBoundary";
import { normalize } from "../../core/domain/normalize";
import { recurClosed } from "../../core/domain/recurrence";
import { TaskDocument } from "../../core/domain/TaskDocument";

const M = { dueDate: "📅", slot: "⏰", repeat: "🔁", priorities: ["p1", "p2"] };
const SECTIONS = { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done", ungrouped: "No section" };
const T = "2026-11-05";
const ZAL = "🔁 every week on Mon, Wed, Fri";

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

function file({ inbox = "", now = "", soon = "", done = "" }: { inbox?: string; now?: string; soon?: string; done?: string }): string {
	const part = (name: string, body: string) => `## ${name}\n${body === "" ? "" : `\n${body}\n`}`;
	return [part("Inbox", inbox), part("Backlog", ""), part("Now", now), part("Soon", soon), part("Done", done)].join("\n");
}

describe("recurClosed: Done and Won't do leave the next copy", () => {
	it("done makes one copy in Soon", () => {
		const doc = normalize(parse(file({ now: `- [x] Зал ${ZAL}` })), T);
		expect(doc.serialize()).toBe(file({ soon: `- [ ] Зал 📅 2026-11-06 ${ZAL}`, done: "- [x] Зал" }));
	});

	it("won't do makes the copy too", () => {
		const doc = normalize(parse(file({ now: `- [-] Зал ${ZAL}` })), T);
		expect(doc.serialize()).toBe(file({ soon: `- [ ] Зал 📅 2026-11-06 ${ZAL}`, done: "- [-] Зал" }));
	});

	it("after done counts from today", () => {
		const doc = normalize(parse(file({ now: "- [x] Постричься 📅 2026-11-01 🔁 every 3 weeks when done" })), T);
		expect(doc.serialize()).toBe(
			file({ soon: "- [ ] Постричься 📅 2026-11-26 🔁 every 3 weeks when done", done: "- [x] Постричься 📅 2026-11-01" }),
		);
	});

	it("goes after the tasks Soon has outside any section", () => {
		const doc = normalize(parse(file({ inbox: `- [x] Зал ${ZAL}`, soon: "- [ ] A 📅 2026-11-10\n### Evening\n- [ ] B 📅 2026-11-10" })), T);
		expect(doc.tasks("soon").map((e) => [e.group, e.task.text])).toEqual([
			[null, "A"],
			[null, "Зал"],
			["Evening", "B"],
		]);
	});

	it("keeps the section name", () => {
		const doc = normalize(parse(file({ now: `- [ ] A\n### Morning\n- [x] Зал ${ZAL}` })), T);
		expect(doc.serialize()).toBe(file({ now: "- [ ] A", soon: `### Morning\n- [ ] Зал 📅 2026-11-06 ${ZAL}`, done: "- [x] Зал" }));
		const next = normalize(doc, "2026-11-06");
		expect(next.tasks("now").map((e) => [e.group, e.task.text])).toEqual([
			[null, "A"],
			["Morning", "Зал"],
		]);
		expect(next.tasks("soon")).toEqual([]);
	});

	it("joins the end of Soon's section of the same name", () => {
		const doc = normalize(parse(file({ now: `### Morning\n- [x] Зал ${ZAL}`, soon: "### Morning\n- [ ] Чай 📅 2026-11-07\n### Evening\n- [ ] B 📅 2026-11-07" })), T);
		expect(doc.tasks("soon").map((e) => [e.group, e.task.text])).toEqual([
			["Morning", "Чай"],
			["Morning", "Зал"],
			["Evening", "B"],
		]);
	});

	it("copy keeps priority, description, subtasks reset", () => {
		const original = [`- [x] p1 Зал ${ZAL}`, "\tВзять полотенце", "\t- [x] A 📅 2026-11-03", "\t- [/] B ⏰ 2026-11-05 10:00"].join("\n");
		const doc = normalize(parse(file({ now: original })), T);
		expect(doc.serialize()).toBe(
			file({
				soon: [`- [ ] p1 Зал 📅 2026-11-06 ${ZAL}`, "\tВзять полотенце", "\t- [ ] A", "\t- [ ] B"].join("\n"),
				done: ["- [x] p1 Зал", "\tВзять полотенце", "\t- [x] A 📅 2026-11-03", "\t- [/] B ⏰ 2026-11-05 10:00"].join("\n"),
			}),
		);
	});

	it("a slot gives the day the next date counts from", () => {
		const doc = normalize(parse(file({ now: "- [x] Зал ⏰ 2026-11-09 03:00 🔁 every week on Mon" })), T, new DayBoundary(4));
		expect(doc.tasks("soon")[0].task.dueDate).toBe("2026-11-09");
	});

	it("is idempotent", () => {
		const once = normalize(parse(file({ now: `### Morning\n- [x] Зал ${ZAL}\n- [-] Постричься 🔁 every 3 weeks when done` })), T);
		expect(normalize(once, T).serialize()).toBe(once.serialize());
		expect(once.tasks("soon")).toHaveLength(2);
	});

	it("a subtask's copy goes to Soon as a task of its own; the done subtask stays under its task", () => {
		const doc = normalize(parse(file({ now: `- [ ] Неделя\n\t- [x] Зал ${ZAL}\n\t\t- [x] Разминка` })), T);
		expect(doc.serialize()).toBe(file({ now: "- [ ] Неделя\n\t- [x] Зал\n\t\t- [x] Разминка", soon: `- [ ] Зал 📅 2026-11-06 ${ZAL}\n\t- [ ] Разминка` }));
	});

	it("a subtask's copy keeps its task's section", () => {
		const doc = normalize(parse(file({ now: `### Morning\n- [ ] Неделя\n\t- [-] Зал ${ZAL}` })), T);
		expect(doc.serialize()).toBe(file({ now: "### Morning\n- [ ] Неделя\n\t- [-] Зал", soon: `### Morning\n- [ ] Зал 📅 2026-11-06 ${ZAL}` }));
	});

	it("leaves an open subtask with a repeat", () => {
		const text = file({ now: `- [ ] Неделя\n\t- [ ] Зал 📅 2026-11-06 ${ZAL}` });
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});

	it("ignores Done", () => {
		const text = file({ done: `- [x] Зал ${ZAL}` });
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});

	it("leaves an open task with a repeat", () => {
		const text = file({ soon: `- [ ] Зал 📅 2026-11-06 ${ZAL}` });
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});

	it("does nothing without a Soon section", () => {
		const text = `## Now\n- [x] Зал ${ZAL}\n`;
		const doc = parse(text);
		expect(recurClosed(doc, T, DayBoundary.MIDNIGHT)).toBe(doc);
	});
});

describe("freshChildren", () => {
	it("opens every subtask at every depth and takes its date, slot and repeat away; description lines stay", () => {
		const doc = parse(["## Now", "- [x] A", "\tТекст", "\t- [-] B 📅 2026-11-03 🔁 every day", "\t\tПро B", "\t\t- [x] C ⏰ 2026-11-05 10:00-11:00", "\t- [?] D"].join("\n"));
		expect(doc.freshChildren(doc.tasks("now")[0])).toEqual(["\tТекст", "\t- [ ] B", "\t\tПро B", "\t\t- [ ] C", "\t- [ ] D"]);
	});

	it("a subtask's reminder kind goes with its slot", () => {
		const markers = { ...M, alarmSlot: "🚨", silentSlot: "🔕" };
		const doc = TaskDocument.parse(["## Now", "- [x] A", "\t- [x] B 🚨 2026-11-05 10:00", "\t- [ ] C 🔕 2026-11-05 11:00"].join("\n"), SECTIONS, markers);
		expect(doc.freshChildren(doc.tasks("now")[0])).toEqual(["\t- [ ] B", "\t- [ ] C"]);
	});

	it("the copy of a task with an alarm has no time and so no reminder kind", () => {
		const markers = { ...M, alarmSlot: "🚨", silentSlot: "🔕" };
		const doc = normalize(TaskDocument.parse(file({ now: `- [x] Зал 🚨 2026-11-05 07:00 ${ZAL}` }), SECTIONS, markers), T);
		expect(doc.serialize()).toBe(file({ soon: `- [ ] Зал 📅 2026-11-06 ${ZAL}`, done: "- [x] Зал 🚨 2026-11-05 07:00" }));
	});
});

describe("the next copy keeps the task's labels", () => {
	it("as it keeps its priority", () => {
		const labelled = { ...M, labelTag: "label", labels: ["Важное"] };
		const doc = TaskDocument.parse("## Now\n- [x] Зал #label/Важное 📅 2026-10-30 🔁 every day\n\n## Soon\n\n## Done\n", SECTIONS, labelled);
		expect(recurClosed(doc, "2026-10-30", DayBoundary.MIDNIGHT).serialize()).toContain("## Soon\n- [ ] Зал #label/Важное 📅 2026-10-31 🔁 every day\n");
	});
});
