import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * Max uses the new plugin before the iPhone app follows, so for a while the app on his phone runs the core of master
 * 0.4.189 (`fixtures/master-0.4.189-phone.js`, `git show` of the committed bundle) on the file the new plugin writes. Its
 * common writes must leave the `## Projects` section and every `🗂️ Name` field exactly as they were.
 */

type Door = { call(method: string, args: string, context: string): string };
const sandbox: { TaskCalendarPhone?: Door } = {};
runInNewContext(readFileSync("tests/phone/fixtures/master-0.4.189-phone.js", "utf8"), sandbox);
const oldApp = sandbox.TaskCalendarPhone!;

const SETTINGS = JSON.stringify({ labels: [{ name: "Fast", color: "red" }] });
const NOW = new Date(2026, 10, 4, 12, 0).getTime();

const TREE = [
	"## Projects",
	"",
	"- Окружение в Сербии",
	"\t- Где знакомиться",
	"\t\t- Приложения для знакомств",
	"\t- Свидание",
	"- Дружба [[Моя заметка о дружбе]]",
	"\t- Small talk",
];

const FILE = [
	"## Inbox",
	"",
	"- [ ] Voice note 🗂️ Свидание",
	"",
	...TREE,
	"",
	"## Now",
	"",
	"- [ ] Call 🗂️ Дружба 🗂️ Small talk #label/Fast ⏰ 2026-11-04 15:00",
	"",
	"## Soon",
	"",
	"- [ ] Гугл как улучшить общение 🗂️ Small talk",
	"- [ ] Parent 🗂️ Где знакомиться 📁",
	"\t- [ ] Step one",
	"\t- [ ] Step two",
	"",
	"## Backlog",
	"",
	"- [ ] Активности как ЛШ 🗂️ Где знакомиться",
	"- [ ] Plain",
	"",
	"## Done",
	"",
	"- [x] Old 🗂️ Дружба",
	"",
].join("\n");

function run(text: string, method: string, ...args: unknown[]): string {
	const answer = JSON.parse(oldApp.call(method, JSON.stringify(args), JSON.stringify({ tasks: text, settings: SETTINGS, nowMs: NOW })));
	if (!answer.ok) throw new Error(`${method}: ${answer.error.message}`);
	return answer.tasks ?? text;
}

const key = (section: string, index: number, raw: string) => ({ section, index, path: [], raw });

function projectLines(text: string): string[] {
	return text.split("\n").filter((line) => line.includes("🗂️"));
}

function treeOf(text: string): string[] {
	const lines = text.split("\n");
	const start = lines.indexOf("## Projects");
	return lines.slice(start, start + TREE.length);
}

/** Every `🗂️` field of the file as it was, each line's fields whole, whatever else the write changed on that line. */
function fieldsOf(text: string): string[] {
	return projectLines(text).map((line) => line.slice(line.indexOf("🗂️")).split(/ (?=#|⏰|📅|📁|🔁)/u)[0]);
}

describe("the app of master 0.4.189 on a file of the new projects", () => {
	const writes: [string, (text: string) => string][] = [
		["reads and tidies it", (t) => run(t, "tasks.screen", "2026-11-04")],
		["moves a task to Soon", (t) => run(t, "tasks.moveToSoon", key("backlog", 0, "- [ ] Активности как ЛШ 🗂️ Где знакомиться"), "2026-11-04")],
		["moves a task before another", (t) => run(t, "tasks.moveBefore", key("soon", 0, "- [ ] Гугл как улучшить общение 🗂️ Small talk"), key("backlog", 1, "- [ ] Plain"), "2026-11-04")],
		["marks a task done", (t) => run(t, "tasks.setStatus", key("inbox", 0, "- [ ] Voice note 🗂️ Свидание"), "done")],
		["marks a timed task with a label done", (t) => run(t, "tasks.setStatus", key("now", 0, "- [ ] Call 🗂️ Дружба 🗂️ Small talk #label/Fast ⏰ 2026-11-04 15:00"), "done")],
		["renames a task as its title reads in the app", (t) => run(t, "tasks.rename", key("now", 0, "- [ ] Call 🗂️ Дружба 🗂️ Small talk #label/Fast ⏰ 2026-11-04 15:00"), "Call Mom 🗂️ Дружба 🗂️ Small talk")],
		["adds a task", (t) => run(t, "tasks.createInPlace", "New one", null, { kind: "list", list: "inbox", group: null, before: null })],
		["takes a subtask out of its parent", (t) => run(t, "tasks.moveToSoon", { section: "soon", index: 1, path: [1], raw: "\t- [ ] Step two" }, "2026-11-04")],
		["moves a timed task to another time", (t) => run(t, "tasks.setSlot", key("now", 0, "- [ ] Call 🗂️ Дружба 🗂️ Small talk #label/Fast ⏰ 2026-11-04 15:00"), { date: "2026-11-04", start: 960, end: null })],
	];

	it.each(writes)("keeps the Projects section byte for byte when it %s", (_name, write) => {
		const after = write(FILE);
		expect(treeOf(after)).toEqual(TREE);
	});

	it.each(writes)("keeps every 🗂️ field when it %s", (_name, write) => {
		const after = write(FILE);
		expect(fieldsOf(after).sort()).toEqual(fieldsOf(FILE).sort());
	});

	it("rewrites an untouched line of a task with projects and a label byte for byte", () => {
		const line = "- [ ] Call 🗂️ Дружба 🗂️ Small talk #label/Fast ⏰ 2026-11-04 15:00";
		const after = run(FILE, "tasks.setSlot", key("now", 0, line), { date: "2026-11-04", start: 900, end: 960 });
		expect(after).toContain("- [ ] Call 🗂️ Дружба 🗂️ Small talk #label/Fast ⏰ 2026-11-04 15:00-16:00");
	});
});
