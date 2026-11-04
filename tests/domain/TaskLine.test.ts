import { describe, expect, it } from "vitest";
import { fieldSlicerFor, formatTaskLine, parseTaskLine, statusOf, type Markers } from "../../src/domain/TaskLine";

const M: Markers = { dueDate: "📅", slot: "⏰" };

describe("parseTaskLine", () => {
	it("parses both fields in any order", () => {
		const p = parseTaskLine("- [/] Сдать отчёт ⏰ 2026-11-02 10:00-11:00 📅 2026-11-03", M)!;
		expect(p.task).toMatchObject({
			status: "inProgress",
			statusChar: "/",
			text: "Сдать отчёт",
			dueDate: "2026-11-03",
			slot: { date: "2026-11-02", start: 600, end: 660 },
			children: [],
		});
	});

	it("parses the fields in the other order", () => {
		const p = parseTaskLine("- [ ] A 📅 2026-11-03 ⏰ 2026-11-02 10:00-11:00", M)!;
		expect(p.task).toMatchObject({ text: "A", dueDate: "2026-11-03", slot: { date: "2026-11-02", start: 600, end: 660 } });
	});

	it("reads a slot without a duration: the start alone", () => {
		const p = parseTaskLine("- [ ] A ⏰ 2026-11-02 10:00 📅 2026-11-03", M)!;
		expect(p.task).toMatchObject({ text: "A", dueDate: "2026-11-03", slot: { date: "2026-11-02", start: 600, end: null } });
		expect(formatTaskLine(p, M)).toBe("- [ ] A 📅 2026-11-03 ⏰ 2026-11-02 10:00");
	});

	it("reads the four statuses", () => {
		expect(parseTaskLine("- [ ] a", M)!.task.status).toBe("todo");
		expect(parseTaskLine("- [/] a", M)!.task.status).toBe("inProgress");
		expect(parseTaskLine("- [x] a", M)!.task.status).toBe("done");
		expect(parseTaskLine("- [-] a", M)!.task.status).toBe("cancelled");
	});

	it("keeps an unknown status char", () => {
		expect(parseTaskLine("- [?] x", M)!.task).toMatchObject({ status: "todo", statusChar: "?" });
	});

	it("keeps a broken field in the text", () => {
		const line = "- [ ] Текст ⏰ 2026-10-30 25:00-26:00";
		const p = parseTaskLine(line, M)!;
		expect(p.task.slot).toBeNull();
		expect(p.task.text).toBe("Текст ⏰ 2026-10-30 25:00-26:00");
		expect(formatTaskLine(p, M)).toBe(line);
	});

	it("reads a slot over midnight: an end before the start is on the next date", () => {
		const line = "- [ ] Ночь ⏰ 2026-10-30 23:00-01:00";
		const p = parseTaskLine(line, M)!;
		expect(p.task.slot).toEqual({ date: "2026-10-30", start: 1380, end: 1500 });
		expect(formatTaskLine(p, M)).toBe(line);
	});

	it("keeps a slot of no length in the text", () => {
		expect(parseTaskLine("- [ ] A ⏰ 2026-10-30 10:00-10:00", M)!.task.slot).toBeNull();
		expect(parseTaskLine("- [ ] A ⏰ 2026-10-30 24:00-01:00", M)!.task.slot).toBeNull();
	});

	it("keeps a broken due date in the text", () => {
		const line = "- [ ] Текст 📅 2026-13-40";
		const p = parseTaskLine(line, M)!;
		expect(p.task.dueDate).toBeNull();
		expect(p.task.text).toBe("Текст 📅 2026-13-40");
		expect(formatTaskLine(p, M)).toBe(line);
	});

	it("keeps unknown tails in the text", () => {
		const p = parseTaskLine("- [ ] Call #tag [[link]] 📅 2026-11-03", M)!;
		expect(p.task.text).toBe("Call #tag [[link]]");
		expect(p.task.dueDate).toBe("2026-11-03");
	});

	it("keeps indent and bullet", () => {
		expect(formatTaskLine(parseTaskLine("  * [x] Done", M)!, M)).toBe("  * [x] Done");
		expect(parseTaskLine("\t+ [ ] Tab", M)).toMatchObject({ indent: "\t", bullet: "+" });
	});

	it("is not a task", () => {
		expect(parseTaskLine("- plain item", M)).toBeNull();
		expect(parseTaskLine("## Now", M)).toBeNull();
		expect(parseTaskLine("", M)).toBeNull();
		expect(parseTaskLine("- [ ]", M)).toBeNull();
		expect(parseTaskLine("- [ab] x", M)).toBeNull();
	});

	it("uses custom markers and escapes them", () => {
		const custom: Markers = { dueDate: "due:", slot: "at(" };
		const p = parseTaskLine("- [ ] A due: 2026-11-03 at( 2026-11-02 10:00-11:00", custom)!;
		expect(p.task).toMatchObject({ text: "A", dueDate: "2026-11-03", slot: { date: "2026-11-02", start: 600, end: 660 } });
	});
});

describe("formatTaskLine", () => {
	it("formats a task with both fields", () => {
		expect(
			formatTaskLine(
				{
					indent: "",
					bullet: "-",
					task: {
						status: "todo",
						statusChar: " ",
						priority: null,
						text: "A",
						dueDate: "2026-11-03",
						slot: { date: "2026-11-02", start: 600, end: 660 },
						reminder: "notification",
						children: [],
					},
				},
				M,
			),
		).toBe("- [ ] A 📅 2026-11-03 ⏰ 2026-11-02 10:00-11:00");
	});

	it("formats a slot ending at midnight", () => {
		expect(
			formatTaskLine(
				{ indent: "", bullet: "-", task: { status: "done", statusChar: "x", text: "A", dueDate: null, slot: { date: "2026-11-02", start: 1380, end: 1440 }, reminder: "notification", priority: null, children: [] } },
				M,
			),
		).toBe("- [x] A ⏰ 2026-11-02 23:00-24:00");
	});
});

describe("statusOf", () => {
	it("maps the chars", () => {
		expect(statusOf(" ")).toBe("todo");
		expect(statusOf("/")).toBe("inProgress");
		expect(statusOf("x")).toBe("done");
		expect(statusOf("-")).toBe("cancelled");
		expect(statusOf("?")).toBe("todo");
	});
});

describe("priority prefix", () => {
	const P: Markers = { ...M, priorities: ["p1", "p2"] };

	it("reads the first word as the priority when it is a level's prefix, and writes it back first", () => {
		const p = parseTaskLine("- [ ] p1 Позвонить 📅 2026-11-03", P)!;
		expect(p.task).toMatchObject({ priority: "p1", text: "Позвонить", dueDate: "2026-11-03" });
		expect(formatTaskLine(p, P)).toBe("- [ ] p1 Позвонить 📅 2026-11-03");
	});

	it("leaves a word that is no level's prefix in the text", () => {
		expect(parseTaskLine("- [ ] p3 X", P)!.task).toMatchObject({ priority: null, text: "p3 X" });
		expect(parseTaskLine("- [ ] p1X", P)!.task).toMatchObject({ priority: null, text: "p1X" });
	});

	it("reads a line that is only the prefix as plain text", () => {
		expect(parseTaskLine("- [ ] p1", P)!.task).toMatchObject({ priority: null, text: "p1" });
		expect(parseTaskLine("- [ ] p1 📅 2026-11-03", P)!.task).toMatchObject({ priority: null, text: "p1" });
	});

	it("reads no priority without levels", () => {
		expect(parseTaskLine("- [ ] p1 X", M)!.task).toMatchObject({ priority: null, text: "p1 X" });
	});
});

describe("fieldSlicerFor", () => {
	it("compiles the markers' patterns once for the same markers", () => {
		const a = fieldSlicerFor({ dueDate: "📅", slot: "⏰" });
		const b = fieldSlicerFor({ dueDate: "📅", slot: "⏰", priorities: ["!"] });
		expect(a).toBe(b);
	});

	it("gives each set of markers its own patterns", () => {
		const line = "- [ ] A @due 2026-11-03";
		expect(parseTaskLine(line, { dueDate: "📅", slot: "⏰" })!.task.dueDate).toBeNull();
		expect(parseTaskLine(line, { dueDate: "@due", slot: "⏰" })!.task.dueDate).toBe("2026-11-03");
		expect(parseTaskLine(line, { dueDate: "📅", slot: "⏰" })!.task.dueDate).toBeNull();
	});
});

describe("reminder kind", () => {
	const R: Markers = { dueDate: "📅", slot: "⏰", alarmSlot: "🚨", silentSlot: "🔕" };

	it("parses the reminder kind from the slot marker", () => {
		const alarm = parseTaskLine("- [ ] Call 🚨 2026-11-04 10:00-11:00", R)!.task;
		expect(alarm).toMatchObject({ reminder: "alarm", text: "Call", slot: { date: "2026-11-04", start: 600, end: 660 } });
		expect(parseTaskLine("- [ ] Call 🔕 2026-11-04 10:00", R)!.task.reminder).toBe("none");
		expect(parseTaskLine("- [ ] Call ⏰ 2026-11-04 10:00", R)!.task.reminder).toBe("notification");
	});

	it("writes the slot with its kind's marker", () => {
		for (const line of ["- [ ] Call 🚨 2026-11-04 10:00-11:00", "- [ ] Call 🔕 2026-11-04 10:00", "- [ ] Call 📅 2026-11-05 ⏰ 2026-11-04 10:00"]) {
			expect(formatTaskLine(parseTaskLine(line, R)!, R)).toBe(line);
		}
	});

	it("a task without a slot reads as notification", () => {
		expect(parseTaskLine("- [ ] Call", R)!.task.reminder).toBe("notification");
	});

	it("markers without alarm and silent read only the slot marker", () => {
		expect(parseTaskLine("- [ ] Call 🚨 2026-11-04 10:00", M)!.task).toMatchObject({ slot: null, text: "Call 🚨 2026-11-04 10:00" });
	});
});
