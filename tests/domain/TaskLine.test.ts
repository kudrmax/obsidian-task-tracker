import { describe, expect, it } from "vitest";
import { formatTaskLine, parseTaskLine, statusOf, type Markers } from "../../src/domain/TaskLine";

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
						text: "A",
						dueDate: "2026-11-03",
						slot: { date: "2026-11-02", start: 600, end: 660 },
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
				{ indent: "", bullet: "-", task: { status: "done", statusChar: "x", text: "A", dueDate: null, slot: { date: "2026-11-02", start: 1380, end: 1440 }, children: [] } },
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
