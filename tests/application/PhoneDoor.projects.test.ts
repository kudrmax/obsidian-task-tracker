import { describe, expect, it } from "vitest";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";
import type { ScreenView, TaskItem, TaskKey } from "../../core/application/contracts";

/** Every action the iPhone app takes, on a task of a project: the `🗂️` stays on the line, and no title shows it. */
const T = "2026-11-07";
const LATER = "2026-11-10";
const NOW = new Date(2026, 10, 7, 9, 0).getTime();
const FIELD = "🗂️ [[Окружение в новой стране]]";
const FILE = [
	"## Inbox",
	"",
	`- [ ] Inbox one ${FIELD}`,
	"",
	"## Now",
	"",
	`- [ ] Exchange ${FIELD}`,
	`\t- [ ] Find a club`,
	`- [ ] Call ${FIELD} 📌 2026-11-07 15:00`,
	"- [ ] Plain",
	"",
	"## Soon",
	"",
	`- [ ] Later ${FIELD}`,
	"",
	"## Backlog",
	"",
	`- [ ] Someday ${FIELD}`,
	"### Дальний",
	"- [ ] Far",
	"",
	"## Done",
	"",
].join("\n");

const context = (tasks: string, extra: Partial<DoorContext> = {}): DoorContext => ({ tasks, settings: JSON.stringify({ labels: [{ name: "Fast", color: "red" }] }), nowMs: NOW, ...extra });

function ok(answer: DoorAnswer): Extract<DoorAnswer, { ok: true }> {
	if (!answer.ok) throw new Error(`${answer.error.code}: ${answer.error.message}`);
	return answer;
}

function screen(text: string, date = T): ScreenView {
	return ok(callDoor("tasks.screen", [date], context(text))).result as ScreenView;
}

const flat = (items: readonly TaskItem[]): TaskItem[] => items.flatMap((i) => [i, ...flat(i.allSubtasks)]);
const all = (s: ScreenView) => flat([...s.inbox, ...s.day.list, ...s.day.slotted, ...s.soon, ...s.backlog, ...s.done]);
const item = (s: ScreenView, text: string) => all(s).find((i) => i.text === text)!;
const keyOf = (text: string, file = FILE): TaskKey => item(screen(file), text).key;

/** The text a call writes. */
function written(method: string, args: unknown[], text = FILE): string {
	const answer = ok(callDoor(method, JSON.parse(JSON.stringify(args)), context(text)));
	expect(answer.tasks, method).toBeDefined();
	return answer.tasks!;
}

/** The line of task `title` in `text`. */
function lineOf(text: string, title: string): string {
	const line = text.split("\n").find((l) => new RegExp(`\\] (p1 )?${title}( |$)`).test(l));
	if (!line) throw new Error(`no line of ${title} in\n${text}`);
	return line;
}

/** The task keeps its project: the field on its line, its title without it. */
function keeps(text: string, title: string, date = T): void {
	expect(lineOf(text, title)).toContain(FIELD);
	const shown = all(screen(text, date)).find((i) => i.text.startsWith(title) || i.text === `${title}`);
	expect(shown, title).toBeDefined();
	expect(shown!.title).not.toContain("🗂️");
	expect(shown!.project?.name).toBe("Окружение в новой стране");
}

describe("the iPhone app's actions on a project's task", () => {
	it("reads the title without the field", () => {
		const s = screen(FILE);
		expect(item(s, "Exchange")).toMatchObject({ title: "Exchange", text: "Exchange" });
		expect(item(s, "Find a club").project?.name).toBe("Окружение в новой стране");
	});

	it("a drag in a list and between columns", () => {
		keeps(written("tasks.drop", [[{ key: keyOf("Exchange"), from: "day" }], { kind: "place", column: "day", place: { kind: "task", group: null, before: null } }, T]), "Exchange");
		keeps(written("tasks.drop", [[{ key: keyOf("Exchange"), from: "day" }], { kind: "place", column: "soon", place: { kind: "task", group: null, before: null } }, T]), "Exchange");
		keeps(written("tasks.drop", [[{ key: keyOf("Later"), from: "soon" }], { kind: "list", column: "day", before: null }, T]), "Later");
		keeps(written("tasks.drop", [[{ key: keyOf("Inbox one"), from: "inbox" }], { kind: "place", column: "backlog", place: { kind: "task", group: "Дальний", before: null } }, T]), "Inbox one");
		keeps(written("tasks.moveBefore", [keyOf("Exchange"), keyOf("Plain"), T]), "Exchange");
	});

	it("onto the timeline and off it", () => {
		const on = written("tasks.drop", [[{ key: keyOf("Exchange"), from: "day" }], { kind: "time", start: 600 }, T]);
		keeps(on, "Exchange");
		const off = written("tasks.drop", [[{ key: item(screen(on), "Exchange").key, from: "timeline" }], { kind: "place", column: "day", place: { kind: "task", group: null, before: null } }, T], on);
		keeps(off, "Exchange");
		keeps(written("tasks.setSlot", [keyOf("Later"), { date: LATER, start: 600, end: 660 }]), "Later", LATER);
	});

	it("a reschedule", () => {
		keeps(written("tasks.postpone", [keyOf("Exchange"), LATER]), "Exchange", LATER);
		keeps(written("tasks.setDueDate", [keyOf("Later"), LATER]), "Later", LATER);
		keeps(written("tasks.postponeAll", [[keyOf("Exchange"), keyOf("Plain")], LATER]), "Exchange", LATER);
	});

	it("the title, the priority and the labels", () => {
		keeps(written("tasks.rename", [keyOf("Exchange"), "Exchange again"]), "Exchange again");
		keeps(written("tasks.edit", [keyOf("Exchange"), { text: "Exchange edited", placement: { kind: "now" }, priority: null }]), "Exchange edited");
		keeps(written("tasks.setPriority", [keyOf("Exchange"), "p1"]), "Exchange");
		keeps(written("tasks.togglePriority", [[keyOf("Exchange")], "p1"]), "Exchange");
		keeps(written("tasks.setLabels", [keyOf("Exchange"), ["Fast"]]), "Exchange");
		keeps(written("tasks.toggleLabel", [[keyOf("Exchange")], "Fast"]), "Exchange");
	});

	it("sections", () => {
		keeps(written("tasks.toSection", [[keyOf("Exchange")], "Morning"]), "Exchange");
		keeps(written("tasks.createGroup", [keyOf("Someday"), "backlog", "Новая"]), "Someday");
		keeps(written("tasks.moveToGroup", [keyOf("Someday"), "backlog", "Дальний", null]), "Someday");
		const made = written("tasks.createSection", ["Вечер", { kind: "day", date: T, group: null, before: keyOf("Exchange") }]);
		keeps(made, "Exchange");
		keeps(written("tasks.renameGroup", ["backlog", "Дальний", "Ближний"], written("tasks.moveToGroup", [keyOf("Someday"), "backlog", "Дальний", null])), "Someday");
	});

	it("subtasks: one added, a task put under another and one taken out", () => {
		keeps(written("tasks.createInPlace", ["Sub", null, { kind: "subtask", parent: keyOf("Exchange"), before: null }]), "Exchange");
		const nested = written("tasks.nest", [keyOf("Later"), keyOf("Exchange"), null]);
		expect(lineOf(nested, "Later")).not.toContain("🗂️");
		expect(item(screen(nested), "Later").project?.name).toBe("Окружение в новой стране");
		const out = written("tasks.drop", [[{ key: keyOf("Find a club"), from: "day" }], { kind: "place", column: "soon", place: { kind: "task", group: null, before: null } }, T]);
		keeps(out, "Find a club");
	});

	it("a repeat, and its next copy when done", () => {
		const repeating = written("tasks.setRepeat", [keyOf("Exchange"), { kind: "afterDone", every: 1, unit: "day", days: [], dayOfMonth: null, from: null }]);
		keeps(repeating, "Exchange");
		const done = written("tasks.setStatus", [item(screen(repeating), "Exchange").key, "done"], repeating);
		expect(done.split("\n").filter((l) => l.includes("Exchange") && l.includes(FIELD))).toHaveLength(2);
	});

	it("done, won't do, delete and undo", () => {
		const done = written("tasks.setStatus", [keyOf("Exchange"), "done"]);
		expect(lineOf(done, "Exchange")).toMatch(/^- \[x\] Exchange 🗂️/);
		keeps(written("tasks.toggleDone", [keyOf("Call")]), "Call");
		const wont = written("tasks.pickStatus", [[keyOf("Exchange")], "wontDo"]);
		expect(lineOf(wont, "Exchange")).toContain(FIELD);
		const removed = ok(callDoor("tasks.remove", [keyOf("Plain")], context(FILE)));
		keeps(removed.tasks!, "Exchange");
		const undone = ok(callDoor("history.undo", [], context(removed.tasks!, { history: removed.history })));
		expect(undone.tasks).toBe(FILE);
	});

	it("the reminders and the phone's capture", () => {
		const id = lineOf(FILE, "Call");
		const reminders = ok(callDoor("reminders.list", [], context(FILE))).result as { id: string; title: string }[];
		expect(reminders.map((r) => [r.id, r.title])).toEqual([[id, "Call"]]);
		keeps(written("reminders.snooze", [id, 30]), "Call");
		keeps(written("reminders.silence", [id]), "Call");
		const completed = written("reminders.complete", [id]);
		expect(lineOf(completed, "Call")).toContain(FIELD);
		expect(lineOf(written("capture.add", ["inbox", "Captured"]), "Captured")).not.toContain("🗂️");
	});

	it("a drop on a column's title through the door: the screen's target handed back, the project kept", () => {
		const view = screen(FILE);
		expect(view.titleDrops.backlog).toEqual({ kind: "title", list: "backlog", date: null, byProject: true });
		const moved = written("tasks.drop", [[{ key: keyOf("Later"), from: "soon" }], view.titleDrops.backlog, T]);
		const backlog = moved.slice(moved.indexOf("## Backlog"), moved.indexOf("### Дальний"));
		expect(backlog.trim().split("\n").filter(Boolean)).toEqual(["## Backlog", `- [ ] Someday ${FIELD}`, `- [ ] Later ${FIELD}`]);
	});
});

describe("the vault's project notes through the door", () => {
	it("rules.projectNotes: the notes with exactly the tag, by name, linked by name or by path on a clash", () => {
		const answer = ok(
			callDoor(
				"rules.projectNotes",
				[
					[
						{ path: "Work/Plan.md", text: "---\ntags: [project]\n---\n" },
						{ path: "Home/Plan.md", text: "#home" },
						{ path: "Окружение.md", text: "Notes #Project" },
						{ path: "Child.md", text: "#project/sub" },
					],
					"#project",
				],
				context(FILE),
			),
		);
		expect(answer.result).toEqual([
			{ name: "Plan", path: "Work/Plan.md", link: "Work/Plan" },
			{ name: "Окружение", path: "Окружение.md", link: "Окружение" },
		]);
	});

	it("rules.noteTags: a note's tags from its text, for a host that keeps them between scans", () => {
		expect(ok(callDoor("rules.noteTags", ["---\ntag: a\n---\n#b `#c`"], context(FILE))).result).toEqual(["#a", "#b"]);
	});
});
