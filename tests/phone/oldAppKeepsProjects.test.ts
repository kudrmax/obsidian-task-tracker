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

describe("an old field and a 🎯 the app of 0.4.189 writes into the new file", () => {
	it("are moved at the new core's next read: plain, the mark gone, the note attached only to what the field names, no duplicate", async () => {
		const { TaskServiceImpl } = await import("../../core/application/TaskServiceImpl");
		const { InMemoryTaskFileStore } = await import("../fakes/InMemoryTaskFileStore");
		const { FakeSettingsStore } = await import("../fakes/FakeSettingsStore");
		const { settingsFrom } = await import("../../core/settings");
		const plain = "- [ ] Plain";
		const withField = run(FILE, "tasks.setProject", [key("backlog", 1, plain)], "Спорт");
		expect(withField).toContain("- [ ] Plain 🗂️ [[Спорт]]");
		const marked = run(withField, "tasks.setResult", key("backlog", 0, "- [ ] Активности как ЛШ 🗂️ Где знакомиться"), true);
		expect(marked).toContain("- [ ] 🎯 Активности как ЛШ 🗂️ Где знакомиться");
		const notes = [
			{ name: "Моя заметка о дружбе", path: "Моя заметка о дружбе.md", link: "Моя заметка о дружбе" },
			{ name: "Спорт", path: "Спорт.md", link: "Спорт" },
			{ name: "Музыка", path: "Музыка.md", link: "Музыка" },
		];
		const store = new InMemoryTaskFileStore(marked);
		const svc = new TaskServiceImpl(store, new FakeSettingsStore(settingsFrom(JSON.parse(SETTINGS))), { now: () => new Date(NOW) }, null, { list: () => notes, ready: () => true, onChange: () => () => undefined });
		await svc.screen("2026-11-04");
		const text = store.text!;
		expect(text).toContain("- [ ] Plain 🗂️ Спорт\n");
		expect(text).toContain("- [ ] Активности как ЛШ 🗂️ Где знакомиться\n");
		expect(text).not.toContain("🎯");
		expect(treeOf(text)).toEqual(TREE);
		expect(text).toContain("\t- Small talk\n- Спорт [[Спорт]]\n");
		expect(text.match(/Моя заметка о дружбе/g)).toHaveLength(1);
		expect(text).not.toContain("Музыка");
	});
});

describe("the app of master 0.4.189 on a file with a folder", () => {
	const FOLDER_TREE = ["## Projects", "", "- Работа 🗃️", "\t- Отчёты", "\t- Найм [[Найм]]", "- Дружба [[Моя заметка о дружбе]]", "\t- Small talk"];
	const WITH_FOLDER = FILE.replace(TREE.join("\n"), FOLDER_TREE.join("\n")).replace("- [ ] Plain", "- [ ] Plain 🗂️ Отчёты");
	const folderTree = (text: string) => {
		const lines = text.split("\n");
		const start = lines.indexOf("## Projects");
		return lines.slice(start, start + FOLDER_TREE.length);
	};
	const writes: [string, (text: string) => string][] = [
		["reads and tidies it", (t) => run(t, "tasks.screen", "2026-11-04")],
		["moves a task of the folder's subproject to Soon", (t) => run(t, "tasks.moveToSoon", key("backlog", 1, "- [ ] Plain 🗂️ Отчёты"), "2026-11-04")],
		["marks it done", (t) => run(t, "tasks.setStatus", key("backlog", 1, "- [ ] Plain 🗂️ Отчёты"), "done")],
		["adds a task", (t) => run(t, "tasks.createInPlace", "New one", null, { kind: "list", list: "inbox", group: null, before: null })],
	];

	it.each(writes)("keeps the folder's line and the section byte for byte when it %s", (_name, write) => {
		const after = write(WITH_FOLDER);
		expect(folderTree(after)).toEqual(FOLDER_TREE);
		expect(fieldsOf(after).sort()).toEqual(fieldsOf(WITH_FOLDER).sort());
	});

	it("is read back by the new core as the folder it was", async () => {
		const { TaskDocument } = await import("../../core/domain/TaskDocument");
		const after = run(WITH_FOLDER, "tasks.setStatus", key("backlog", 1, "- [ ] Plain 🗂️ Отчёты"), "done");
		const doc = TaskDocument.parse(after, { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done", ungrouped: "No section" }, { dueDate: "📅", slot: "⏰", collapsed: "📁" });
		expect(doc.projectTree().find("Работа")!.node.folder).toBe(true);
		expect(doc.projectTree().find("Найм")!.node.note).toBe("Найм");
	});
});
