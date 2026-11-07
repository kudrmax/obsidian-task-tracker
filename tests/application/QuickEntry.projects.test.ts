import { describe, expect, it } from "vitest";
import type { Clock } from "../../core/application/ports";
import { type EntryLook, QuickEntry } from "../../core/application/QuickEntry";
import type { ListCard } from "../../core/application/nesting";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-11-07";
const clock: Clock = { now: () => new Date(2026, 10, 7, 14, 20) };
const key = (raw: string, index: number) => ({ section: "backlog" as const, index, path: [], raw });

function setup(project?: string) {
	const svc = new TaskServiceImpl(new InMemoryTaskFileStore("## Backlog\n- [ ] A 🗂️ [[P]]\n- [ ] B\n"), new FakeSettingsStore(), clock);
	const cards: ListCard[] = [
		{ key: key("- [ ] A 🗂️ [[P]]", 0), level: 0, group: null, project: "P" },
		{ key: key("- [ ] B", 1), level: 0, group: null, project: null },
	];
	const look: EntryLook = {
		cards: (column) => (column === "backlog" ? cards : []),
		sections: (column) => (column === "backlog" ? [{ group: null, project: "P" }, { group: null, project: null }] : []),
		sectioned: (column) => column === "backlog",
		day: () => T,
		today: () => T,
		shown: () => ["backlog"],
		...(project !== undefined && { project: () => project }),
	};
	return new QuickEntry(svc, look);
}

describe("the quick entry in a project's group", () => {
	it("writes the task with that project after its last task", () => {
		const entry = setup();
		entry.open({ kind: "list", column: "backlog", place: { kind: "gap", index: 1, level: 0, group: null, project: "P" } });
		entry.type("New");
		entry.enter();
		expect(entry.call(entry.session.jobs[0].id)).toEqual({ method: "createInPlace", args: ["New", null, { kind: "list", list: "backlog", group: null, before: null, project: "P" }, null, []] });
	});

	it("a section is born with its first task: the name, then the task, written together", () => {
		const entry = setup();
		entry.open({ kind: "list", column: "backlog", place: { kind: "gap", index: 1, level: 0, group: null, project: "P" } });
		entry.toggleSection();
		entry.type("Идеи");
		entry.enter();
		expect(entry.session.jobs).toEqual([]);
		expect(entry.state).toMatchObject({ newSection: "Идеи", section: false, text: "" });
		expect(entry.listEntry("backlog")?.newSection).toBe("Идеи");
		entry.type("First");
		entry.enter();
		expect(entry.state).toBeNull();
		const call = entry.call(entry.session.jobs[0].id);
		expect(call).toEqual({ method: "createInPlace", args: ["First", null, { kind: "list", list: "backlog", group: null, before: null, project: "P", section: "Идеи" }, null, []] });
	});

	it("Escape after the name drops both, and so does an empty Enter", () => {
		const entry = setup();
		entry.open({ kind: "list", column: "backlog", place: { kind: "gap", index: 1, level: 0, group: null, project: "P" } });
		entry.toggleSection();
		entry.type("Идеи");
		entry.enter();
		entry.enter();
		expect(entry.state).toBeNull();
		expect(entry.session.jobs).toEqual([]);
	});

	it("in a project's own view, a slot gets the project too", () => {
		const entry = setup("P");
		entry.openSlot({ date: T, start: 600, end: null });
		entry.type("At ten");
		entry.enter();
		expect(entry.call(entry.session.jobs[0].id)).toEqual({ method: "createInPlace", args: ["At ten", null, { kind: "slot", slot: { date: T, start: 600, end: null }, project: "P" }, null, []] });
	});
});
