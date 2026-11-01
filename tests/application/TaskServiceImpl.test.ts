import { describe, expect, it } from "vitest";
import { StaleTaskError, TasksFileMissingError } from "../../src/application/contracts";
import type { Clock } from "../../src/application/ports";
import { TaskServiceImpl } from "../../src/application/TaskServiceImpl";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-10-30";
const D = "2026-11-03";
const clock: Clock = { now: () => new Date(2026, 9, 30, 14, 20) };
const FULL = "## Inbox\n\n## Now\n- [ ] A\n- [ ] B\n\n## Soon\n- [ ] C\n\n## Backlog\n\n## Done\n";

function setup(text: string | null, settings = new FakeSettingsStore()) {
	const store = new InMemoryTaskFileStore(text);
	const svc = new TaskServiceImpl(store, settings, clock);
	return { store, svc };
}

describe("reading", () => {
	it("dayView of a missing file rejects with TasksFileMissingError", async () => {
		const { svc } = setup(null);
		await expect(svc.dayView(T)).rejects.toBeInstanceOf(TasksFileMissingError);
		await expect(svc.soonWithoutDateView()).rejects.toBeInstanceOf(TasksFileMissingError);
	});

	it("dayView gives the list and the slotted tasks with keys", async () => {
		const { svc } = setup("## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n- [/] B 📅 2026-11-03\n\n## Soon\n- [ ] C\n- [ ] D 📅 2026-11-03\n");
		const today = await svc.dayView(T);
		expect(today.date).toBe(T);
		expect(today.list.map((i) => i.text)).toEqual(["B"]);
		expect(today.list[0]).toMatchObject({ key: { section: "now", index: 1, raw: "- [/] B 📅 2026-11-03" }, status: "inProgress", dueDate: D });
		expect(today.slotted.map((i) => i.text)).toEqual(["A"]);
		const other = await svc.dayView(D);
		expect(other.list.map((i) => i.text)).toEqual(["B", "D"]);
		expect(other.slotted).toEqual([]);
	});

	it("soonWithoutDateView lists Soon tasks without fields", async () => {
		const { svc } = setup("## Now\n- [ ] A\n\n## Soon\n- [ ] C\n- [ ] D 📅 2026-11-03\n- [ ] E ⏰ 2026-11-03 10:00-11:00\n");
		expect((await svc.soonWithoutDateView()).map((i) => i.text)).toEqual(["C"]);
	});

	it("dayView normalizes for reading without writing", async () => {
		const { store, svc } = setup("## Now\n- [x] Done\n- [ ] A ⏰ 2026-10-01 10:00-11:00\n\n## Soon\n- [ ] S 📅 2026-10-30\n\n## Done\n");
		const view = await svc.dayView(T);
		expect(view.list.map((i) => i.text)).toEqual(["S", "A"]);
		expect(view.list[1].slot).toBeNull();
		expect(store.writes).toBe(0);
	});
});

describe("writing", () => {
	it("setStatus done moves the task to Done in one write", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n- [ ] A\n- [ ] B\n\n## Soon\n\n## Done\n");
		const view = await svc.dayView(T);
		await svc.setStatus(view.list[0].key, "done");
		expect(store.writes).toBe(1);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] B\n\n## Soon\n\n## Done\n- [x] A\n");
	});

	it("rejects a stale key and leaves the file alone", async () => {
		const { store, svc } = setup("## Now\n- [ ] A\n- [ ] B\n");
		const view = await svc.dayView(T);
		store.text = "## Now\n- [ ] Changed\n- [ ] B\n";
		await expect(svc.setStatus(view.list[0].key, "done")).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe("## Now\n- [ ] Changed\n- [ ] B\n");
		store.text = "## Now\n";
		await expect(svc.remove(view.list[1].key)).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe("## Now\n");
	});

	it("keys refer to the normalized file even before it was written", async () => {
		const { store, svc } = setup("## Now\n- [x] Old\n- [ ] A\n\n## Done\n");
		const view = await svc.dayView(T);
		expect(view.list[0].key).toEqual({ section: "now", index: 0, path: [], raw: "- [ ] A" });
		await svc.rename(view.list[0].key, "A2");
		expect(store.text).toBe("## Now\n- [ ] A2\n\n## Done\n- [x] Old\n\n## Inbox\n\n## Soon\n");
	});

	it("adds the missing Inbox, Now, Soon and Done on first write", async () => {
		const { store, svc } = setup("## Now\n");
		await svc.createInList(T, "A");
		expect(store.text).toBe("## Now\n- [ ] A 📅 2026-10-30\n\n## Inbox\n\n## Soon\n\n## Done\n");
		await svc.createInSoon("S");
		expect(store.text).toBe("## Now\n- [ ] A 📅 2026-10-30\n\n## Inbox\n\n## Soon\n- [ ] S\n\n## Done\n");
	});

	it("uses the section names and markers from settings", async () => {
		const settings = new FakeSettingsStore({
			...DEFAULT_SETTINGS,
			sections: { inbox: "In", now: "Today", soon: "Next", backlog: "Later", done: "Finished" },
			dueDateMarker: "due:",
			slotMarker: "at:",
		});
		const { store, svc } = setup("## In\n\n## Today\n\n## Next\n\n## Finished\n", settings);
		await svc.createInList(D, "A");
		expect(store.text).toBe("## In\n\n## Today\n\n## Next\n- [ ] A due: 2026-11-03\n\n## Finished\n");
	});

	it("whitespace-only text creates nothing", async () => {
		const { store, svc } = setup(FULL);
		await svc.createInList(T, "   ");
		await svc.createInSoon("");
		await svc.createAtTime(T, 600, "\t\n");
		const view = await svc.dayView(T);
		await svc.rename(view.list[0].key, "  ");
		expect(store.writes).toBe(0);
		expect(store.text).toBe(FULL);
	});

	it("shows a task's description and writes a new one under it, nothing when it is the same", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n- [ ] A\n\t- note\n- [ ] B\n\n## Soon\n\n## Backlog\n\n## Done\n");
		const [a, b] = (await svc.dayView(T)).list;
		expect(a.description).toBe("- note");
		expect(b.description).toBeNull();
		const before = store.text;
		await svc.setDescription(a.key, "- note");
		expect(store.text).toBe(before);
		await svc.setDescription(b.key, "- first\n\t- deeper");
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A\n\t- note\n- [ ] B\n\t- first\n\t\t- deeper\n\n## Soon\n\n## Backlog\n\n## Done\n");
	});

	it("rejects a description for a task that changed in the file", async () => {
		const { store, svc } = setup("## Now\n- [ ] A\n");
		const view = await svc.dayView(T);
		store.text = "## Now\n- [ ] Changed\n";
		await expect(svc.setDescription(view.list[0].key, "- x")).rejects.toBeInstanceOf(StaleTaskError);
	});

	it("createAtTime puts the task at the time, without a duration", async () => {
		const { store, svc } = setup(FULL);
		await svc.createAtTime(T, 600, "Call");
		expect(store.text).toContain("## Now\n- [ ] A\n- [ ] B\n- [ ] Call ⏰ 2026-10-30 10:00\n");
		await svc.createAtTime(D, 1420, "Late");
		expect(store.text).toContain("## Soon\n- [ ] C\n- [ ] Late ⏰ 2026-11-03 23:40\n");
	});

	it("normalizes after every write", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n- [ ] A\n\n## Soon\n- [ ] S\n\n## Done\n");
		const soon = await svc.soonWithoutDateView();
		await svc.setDueDate(soon[0].key, T);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] S 📅 2026-10-30\n- [ ] A\n\n## Soon\n\n## Done\n");
	});

	it("moves tasks between the list, Soon and the timeline", async () => {
		const { store, svc } = setup(FULL);
		let view = await svc.dayView(T);
		await svc.setSlot(view.list[0].key, { date: T, start: 600, end: 660 });
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n- [ ] B\n\n## Soon\n- [ ] C\n\n## Backlog\n\n## Done\n");
		view = await svc.dayView(T);
		await svc.clearSlot(view.slotted[0].key);
		expect(store.text).toBe(FULL);
		const soon = await svc.soonWithoutDateView();
		await svc.moveToList(soon[0].key, T);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A\n- [ ] B\n- [ ] C 📅 2026-10-30\n\n## Soon\n\n## Backlog\n\n## Done\n");
		view = await svc.dayView(T);
		await svc.moveToSoon(view.list[0].key, T);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] B\n- [ ] C 📅 2026-10-30\n\n## Soon\n- [ ] A\n\n## Backlog\n\n## Done\n");
		view = await svc.dayView(T);
		await svc.moveBefore(view.list[1].key, view.list[0].key, T);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] C 📅 2026-10-30\n- [ ] B\n\n## Soon\n- [ ] A\n\n## Backlog\n\n## Done\n");
		view = await svc.dayView(T);
		await svc.remove(view.list[0].key);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] B\n\n## Soon\n- [ ] A\n\n## Backlog\n\n## Done\n");
	});

	it("clearSlot with a place puts the task where it was dropped on the list", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n- [ ] A ⏰ 2026-10-30 10:00\n- [ ] B\n- [ ] C\n\n## Soon\n\n## Done\n");
		let view = await svc.dayView(T);
		await svc.clearSlot(view.slotted[0].key, { before: null, date: T });
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] B\n- [ ] C\n- [ ] A 📅 2026-10-30\n\n## Soon\n\n## Done\n");
		await svc.setSlot((await svc.dayView(T)).list[2].key, { date: T, start: 600, end: null });
		view = await svc.dayView(T);
		await svc.clearSlot(view.slotted[0].key, { before: view.list[1].key, date: T });
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] B\n- [ ] A 📅 2026-10-30\n- [ ] C\n\n## Soon\n\n## Done\n");
	});

	it("normalize writes only when a rule changed something", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n- [ ] A\n\n## Soon\n\n## Done\n");
		await svc.normalize();
		expect(store.writes).toBe(0);
		store.text = "## Inbox\n\n## Now\n- [x] A\n\n## Soon\n\n## Done\n";
		await svc.normalize();
		expect(store.writes).toBe(1);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n## Soon\n\n## Done\n- [x] A\n");
	});

	it("normalize of a missing file does nothing", async () => {
		const { store, svc } = setup(null);
		await svc.normalize();
		expect(store.text).toBeNull();
	});

	it("createFile writes the five sections from settings", async () => {
		const { store, svc } = setup(null);
		await svc.createFile();
		expect(store.text).toBe("## Inbox\n\n## Now\n\n## Soon\n\n## Backlog\n\n## Done\n");
	});
});

describe("the task sheet", () => {
	it("create places by the tile and keeps a slot", async () => {
		const { store, svc } = setup(FULL);
		await svc.create({ text: "S", placement: { kind: "soon" }, priority: null });
		await svc.create({ text: "N", placement: { kind: "now" }, priority: null });
		await svc.create({ text: "D", placement: { kind: "date", date: D }, priority: null }, { date: D, start: 600, end: 660 });
		await svc.create({ text: "P", placement: { kind: "date", date: "2026-10-01" }, priority: null });
		expect(store.writes).toBe(4);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A\n- [ ] B\n- [ ] N 📅 2026-10-30\n- [ ] P 📅 2026-10-30\n\n## Soon\n- [ ] C\n- [ ] S\n- [ ] D 📅 2026-11-03 ⏰ 2026-11-03 10:00-11:00\n\n## Backlog\n\n## Done\n");
	});

	it("create with blank text writes nothing", async () => {
		const { store, svc } = setup(FULL);
		await svc.create({ text: " ", placement: { kind: "now" }, priority: null });
		expect(store.writes).toBe(0);
	});

	it("edit with the same placement only renames in place", async () => {
		const { store, svc } = setup(FULL);
		const view = await svc.dayView(T);
		await svc.edit(view.list[0].key, { text: "A2", placement: { kind: "now" }, priority: null });
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A2\n- [ ] B\n\n## Soon\n- [ ] C\n\n## Backlog\n\n## Done\n");
	});

	it("edit with another placement moves the task", async () => {
		const { store, svc } = setup(FULL);
		const view = await svc.dayView(T);
		await svc.edit(view.list[0].key, { text: "A", placement: { kind: "soon" }, priority: null });
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] B\n\n## Soon\n- [ ] C\n- [ ] A\n\n## Backlog\n\n## Done\n");
	});

	it("edit with blank text writes nothing and a stale key is rejected", async () => {
		const { store, svc } = setup(FULL);
		const view = await svc.dayView(T);
		await svc.edit(view.list[0].key, { text: "", placement: { kind: "soon" }, priority: null });
		expect(store.writes).toBe(0);
		store.text = "## Now\n- [ ] Changed\n";
		await expect(svc.edit(view.list[0].key, { text: "X", placement: { kind: "soon" }, priority: null })).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe("## Now\n- [ ] Changed\n");
	});

	it("placementOf returns now for today's due date, the date for another one, else the section", async () => {
		const { svc } = setup("## Now\n- [ ] A 📅 2026-11-03\n- [ ] B\n- [ ] C 📅 2026-10-30\n\n## Soon\n- [ ] S\n");
		const view = await svc.dayView(T);
		expect(svc.placementOf(view.list[0])).toEqual({ kind: "date", date: D });
		expect(svc.placementOf(view.list[1])).toEqual({ kind: "now" });
		expect(svc.placementOf(view.list[2])).toEqual({ kind: "now" });
		expect(svc.placementOf((await svc.soonWithoutDateView())[0])).toEqual({ kind: "soon" });
	});
});

describe("onChange", () => {
	it("fires once on a hand edit and once after each own write", async () => {
		const { store, svc } = setup(FULL);
		let fired = 0;
		const off = svc.onChange(() => fired++);
		store.emitChange();
		expect(fired).toBe(1);
		await svc.createInSoon("X");
		expect(fired).toBe(2);
		await svc.createInSoon("  ");
		expect(fired).toBe(2);
		off();
		store.emitChange();
		await svc.createInSoon("Y");
		expect(fired).toBe(2);
	});

	it("fires after createFile", async () => {
		const { svc } = setup(null);
		let fired = 0;
		svc.onChange(() => fired++);
		await svc.createFile();
		expect(fired).toBe(1);
	});
});

describe("a day that starts at 4", () => {
	const night: Clock = { now: () => new Date(2026, 9, 31, 2, 0) };
	const settings = () => new FakeSettingsStore({ ...DEFAULT_SETTINGS, dayStartHour: 4 });

	it("at 2 at night today is still the day before", async () => {
		const store = new InMemoryTaskFileStore("## Inbox\n\n## Now\n\n## Soon\n- [ ] Due 📅 2026-10-31\n");
		const svc = new TaskServiceImpl(store, settings(), night);
		await svc.createInList(T, "Late");
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] Late 📅 2026-10-30\n\n## Soon\n- [ ] Due 📅 2026-10-31\n\n## Done\n");
	});

	it("the day's timeline takes the slots after midnight and a slot there keeps a Now task in Now", async () => {
		const store = new InMemoryTaskFileStore("## Inbox\n\n## Now\n- [ ] A\n- [ ] B ⏰ 2026-10-31 01:00-02:00\n\n## Soon\n\n## Done\n");
		const svc = new TaskServiceImpl(store, settings(), night);
		const day = await svc.dayView(T);
		expect(day.slotted.map((i) => i.text)).toEqual(["B"]);
		await svc.setSlot(day.list[0].key, { date: "2026-10-31", start: 180, end: 300 });
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A ⏰ 2026-10-31 03:00-04:00\n- [ ] B ⏰ 2026-10-31 01:00-02:00\n\n## Soon\n\n## Done\n");
	});
});

describe("Inbox", () => {
	it("inboxView lists the Inbox tasks with their keys and the Inbox placement", async () => {
		const { svc } = setup("## Inbox\n- [ ] I\n- [/] J\n\n## Now\n- [ ] A\n\n## Soon\n- [ ] C\n");
		const inbox = await svc.inboxView();
		expect(inbox.map((i) => i.text)).toEqual(["I", "J"]);
		expect(inbox[1].key).toEqual({ section: "inbox", index: 1, path: [], raw: "- [/] J" });
		expect(svc.placementOf(inbox[0])).toEqual({ kind: "inbox" });
		expect((await svc.dayView(T)).list.map((i) => i.text)).toEqual(["A"]);
	});

	it("the Inbox tile creates at the end of Inbox", async () => {
		const { store, svc } = setup(FULL);
		await svc.create({ text: "New", placement: { kind: "inbox" }, priority: null });
		expect(store.text).toBe("## Inbox\n- [ ] New\n\n## Now\n- [ ] A\n- [ ] B\n\n## Soon\n- [ ] C\n\n## Backlog\n\n## Done\n");
	});

	it("a due date from the menu takes the task out of Inbox", async () => {
		const { store, svc } = setup("## Inbox\n- [ ] I\n\n## Now\n- [ ] A\n\n## Soon\n- [ ] C\n\n## Done\n");
		await svc.setDueDate((await svc.inboxView())[0].key, D);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A\n\n## Soon\n- [ ] C\n- [ ] I 📅 2026-11-03\n\n## Done\n");
	});

	it("moveToEnd drags between Inbox and Soon", async () => {
		const { store, svc } = setup("## Inbox\n- [ ] I\n\n## Now\n\n## Soon\n- [ ] C\n- [ ] E\n\n## Done\n");
		await svc.moveToEnd((await svc.inboxView())[0].key, "soon");
		expect(store.text).toBe("## Inbox\n\n## Now\n\n## Soon\n- [ ] C\n- [ ] E\n- [ ] I\n\n## Done\n");
		await svc.moveToEnd((await svc.soonWithoutDateView())[0].key, "inbox");
		expect(store.text).toBe("## Inbox\n- [ ] C\n\n## Now\n\n## Soon\n- [ ] E\n- [ ] I\n\n## Done\n");
		await svc.moveToEnd((await svc.soonWithoutDateView())[0].key, "soon");
		expect(store.text).toBe("## Inbox\n- [ ] C\n\n## Now\n\n## Soon\n- [ ] I\n- [ ] E\n\n## Done\n");
	});

	it("adds a missing Inbox heading at the end on the first write", async () => {
		const { store, svc } = setup("## Now\n- [ ] A\n\n## Soon\n\n## Done\n");
		await svc.createInSoon("S");
		expect(store.text).toBe("## Now\n- [ ] A\n\n## Soon\n- [ ] S\n\n## Done\n\n## Inbox\n");
	});
});

describe("priority", () => {
	const withLevels = (priorities: typeof DEFAULT_SETTINGS.priorities) => new FakeSettingsStore({ ...DEFAULT_SETTINGS, priorities });

	it("gives an item its level and the text without the prefix", async () => {
		const { svc } = setup("## Now\n- [ ] p1 A\n- [ ] B\n");
		const view = await svc.dayView(T);
		expect(view.list[0]).toMatchObject({ text: "A", priority: { prefix: "p1", color: "red" } });
		expect(view.list[1].priority).toBeNull();
	});

	it("setPriority writes the prefix, null takes it off", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n- [ ] p1 A\n\n## Soon\n\n## Done\n");
		await svc.setPriority((await svc.dayView(T)).list[0].key, "p2");
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] p2 A\n\n## Soon\n\n## Done\n");
		await svc.setPriority((await svc.dayView(T)).list[0].key, null);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A\n\n## Soon\n\n## Done\n");
	});

	it("reads a prefix no level has as text, and leaves the line alone", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n- [ ] p1 A\n- [ ] B\n\n## Soon\n\n## Done\n", withLevels([]));
		const view = await svc.dayView(T);
		expect(view.list[0]).toMatchObject({ text: "p1 A", priority: null });
		await svc.rename(view.list[1].key, "C");
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] p1 A\n- [ ] C\n\n## Soon\n\n## Done\n");
	});

	it("takes the first of two levels with one prefix, and ignores a prefix with a space", async () => {
		const { svc } = setup("## Now\n- [ ] p1 A\n- [ ] x y B\n", withLevels([
			{ prefix: "p1", color: "blue" },
			{ prefix: "p1", color: "red" },
			{ prefix: "x y", color: "green" },
		]));
		const view = await svc.dayView(T);
		expect(view.list[0].priority).toEqual({ prefix: "p1", color: "blue" });
		expect(view.list[1]).toMatchObject({ text: "x y B", priority: null });
	});
});

describe("postpone", () => {
	it("takes a task off today: the due date, no time, the end of Soon", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n- [ ] B\n\n## Soon\n- [ ] C\n\n## Backlog\n\n## Done\n");
		const view = await svc.dayView(T);
		await svc.postpone(view.slotted[0].key, "2026-10-31");
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] B\n\n## Soon\n- [ ] C\n- [ ] A 📅 2026-10-31\n\n## Backlog\n\n## Done\n");
	});
});

describe("sections", () => {
	const TEXT = "## Inbox\n\n## Now\n- [ ] A\n### X\n- [ ] B\n\n## Soon\n- [ ] C\n\n## Done\n";

	it("items carry their section", async () => {
		const { svc } = setup(TEXT);
		expect((await svc.dayView(T)).list.map((i) => i.group)).toEqual([null, "X"]);
	});

	it("createGroup makes a section from a drop and normalizes", async () => {
		const { store, svc } = setup(TEXT);
		const [c] = await svc.soonWithoutDateView();
		await svc.createGroup(c.key, "now", "Evening");
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A\n### X\n- [ ] B\n### Evening\n- [ ] C 📅 2026-10-30\n\n## Soon\n\n## Done\n");
	});

	it("reads the No section heading by the name in settings", async () => {
		const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, groups: { presets: [], ungrouped: "Без секции" } });
		const { svc } = setup("## Now\n### X\n- [ ] B\n### Без секции\n- [ ] A\n", settings);
		expect((await svc.dayView(T)).list.map((i) => [i.text, i.group])).toEqual([["B", "X"], ["A", null]]);
	});

	it("moveToGroup, renameGroup, removeGroup and moveGroup write once each", async () => {
		const { store, svc } = setup(TEXT);
		const [a] = (await svc.dayView(T)).list;
		await svc.moveToGroup(a.key, "now", "X", null);
		expect(store.text).toBe("## Inbox\n\n## Now\n### X\n- [ ] B\n- [ ] A 📅 2026-10-30\n\n## Soon\n- [ ] C\n\n## Done\n");
		await svc.renameGroup("now", "X", "Вечер");
		expect(store.text).toContain("### Вечер\n");
		await svc.removeGroup("now", "Вечер");
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] B\n- [ ] A 📅 2026-10-30\n\n## Soon\n- [ ] C\n\n## Done\n");
		expect(store.writes).toBe(3);
	});

	it("a group missing from the file rejects with StaleTaskError and writes nothing", async () => {
		const { store, svc } = setup(TEXT);
		const [a] = (await svc.dayView(T)).list;
		await expect(svc.renameGroup("now", "Y", "Z")).rejects.toBeInstanceOf(StaleTaskError);
		await expect(svc.removeGroup("now", "Y")).rejects.toBeInstanceOf(StaleTaskError);
		await expect(svc.moveGroup("now", "Y", "end")).rejects.toBeInstanceOf(StaleTaskError);
		await expect(svc.moveGroup("now", "X", { before: "Y" })).rejects.toBeInstanceOf(StaleTaskError);
		await expect(svc.moveToGroup(a.key, "now", "Y", null)).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe(TEXT);
	});
});

describe("createInPlace", () => {
	const TEXT = "## Inbox\n\n## Now\n- [ ] A\n### X\n- [ ] B\n\n## Soon\n- [ ] C\n\n## Done\n";

	it("list before a key writes once and puts the task there with the list's rules", async () => {
		const { store, svc } = setup(TEXT);
		const [, b] = (await svc.dayView(T)).list;
		await svc.createInPlace("N", "p1", { kind: "list", list: "now", group: "X", before: b.key });
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A\n### X\n- [ ] p1 N 📅 2026-10-30\n- [ ] B\n\n## Soon\n- [ ] C\n\n## Done\n");
		expect(store.writes).toBe(1);
	});

	it("list with a date puts a later day in Soon with that due date", async () => {
		const { store, svc } = setup(TEXT);
		await svc.createInPlace("N", null, { kind: "list", list: "soon", group: null, before: null, date: D });
		expect(store.text).toContain("## Soon\n- [ ] C\n- [ ] N 📅 2026-11-03\n");
	});

	it("list with a stale before rejects with StaleTaskError and writes nothing", async () => {
		const { store, svc } = setup(TEXT);
		const [a] = (await svc.dayView(T)).list;
		store.text = TEXT.replace("A\n", "Changed\n");
		const changed = store.text;
		await expect(svc.createInPlace("N", null, { kind: "list", list: "now", group: null, before: a.key })).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe(changed);
	});

	it("list in a section missing from the file rejects with StaleTaskError", async () => {
		const { store, svc } = setup(TEXT);
		await expect(svc.createInPlace("N", null, { kind: "list", list: "now", group: "Y", before: null })).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe(TEXT);
	});

	it("blank text writes nothing", async () => {
		const { store, svc } = setup(TEXT);
		await svc.createInPlace("  \t", null, { kind: "list", list: "now", group: null, before: null });
		expect(store.writes).toBe(0);
		expect(store.text).toBe(TEXT);
	});

	it("subtask goes among the parent's subtasks, before a key or last", async () => {
		const TRIP = "## Inbox\n\n## Now\n- [ ] Trip\n\t- [ ] Compare\n\t- [ ] Pay\n\n## Soon\n\n## Done\n";
		const { store, svc } = setup(TRIP);
		const [trip] = (await svc.dayView(T)).list;
		const pay = trip.subtasks[1];
		await svc.createInPlace("Bag", null, { kind: "subtask", parent: trip.key, before: pay.key });
		expect(store.text).toContain("\t- [ ] Compare\n\t- [ ] Bag\n\t- [ ] Pay\n");
		await svc.createInPlace("Last", "p2", { kind: "subtask", parent: trip.key, before: null });
		expect(store.text).toContain("\t- [ ] Pay\n\t- [ ] p2 Last\n");
		expect(store.writes).toBe(2);
	});

	it("slot is created as createAtTime does", async () => {
		const a = setup(FULL);
		const b = setup(FULL);
		await a.svc.createInPlace("Call", null, { kind: "slot", slot: { date: T, start: 600, end: null } });
		await b.svc.createAtTime(T, 600, "Call");
		expect(a.store.text).toBe(b.store.text);
		expect(a.store.writes).toBe(1);
	});
});

describe("subtasks", () => {
	const TRIP = "## Inbox\n\n## Now\n- [ ] Trip\n\t- [x] Compare\n\t- [ ] Pay\n- [ ] Call\n\n## Soon\n\n## Done\n";

	it("shows a task's open subtasks under it, with keys of their own", async () => {
		const { svc } = setup(TRIP);
		const [trip] = (await svc.dayView(T)).list;
		expect(trip.progress).toEqual({ done: 1, total: 2 });
		expect(trip.subtasks.map((s) => s.key)).toEqual([{ section: "now", index: 0, path: [1], raw: "\t- [ ] Pay" }]);
	});

	it("acts on a subtask by its key and rejects a stale one", async () => {
		const { store, svc } = setup(TRIP);
		const pay = (await svc.dayView(T)).list[0].subtasks[0];
		await svc.rename(pay.key, "Pay all");
		expect(store.text).toContain("\t- [ ] Pay all\n");
		await expect(svc.setStatus(pay.key, "done")).rejects.toBeInstanceOf(StaleTaskError);
	});

	it("adds a subtask last under its task and nests a task under another", async () => {
		const { store, svc } = setup(TRIP);
		const [trip, call] = (await svc.dayView(T)).list;
		await svc.createSubtask(trip.key, { text: "Bag", placement: svc.placementOf(trip), priority: null });
		expect(store.text).toContain("\t- [ ] Pay\n\t- [ ] Bag\n- [ ] Call\n");
		const fresh = (await svc.dayView(T)).list;
		await svc.nest(fresh[1].key, fresh[0].key, fresh[0].subtasks[0].key);
		expect(store.text).toContain("- [ ] Trip\n\t- [x] Compare\n\t- [ ] Call\n\t- [ ] Pay\n\t- [ ] Bag\n");
		expect(call.text).toBe("Call");
	});
});

describe("sections of a later day", () => {
	const TEXT = "## Inbox\n\n## Now\n- [ ] A\n\n## Soon\n\n## Done\n";

	it("planned in the evening for tomorrow, the task is in the same section of Now when tomorrow comes", async () => {
		const evening = setup(TEXT);
		const [a] = (await evening.svc.dayView(T)).list;
		await evening.svc.createGroup(a.key, "soon", "Morning", "2026-10-31");
		expect(evening.store.text).toBe("## Inbox\n\n## Now\n\n## Soon\n### Morning\n- [ ] A 📅 2026-10-31\n\n## Done\n");
		expect((await evening.svc.dayView("2026-10-31")).list.map((i) => [i.text, i.group])).toEqual([["A", "Morning"]]);
		const morning = new TaskServiceImpl(evening.store, new FakeSettingsStore(), { now: () => new Date(2026, 9, 31, 9, 0) });
		expect((await morning.dayView("2026-10-31")).list.map((i) => [i.text, i.group])).toEqual([["A", "Morning"]]);
		await morning.normalize();
		expect(evening.store.text).toBe("## Inbox\n\n## Now\n### Morning\n- [ ] A 📅 2026-10-31\n\n## Soon\n\n## Done\n");
	});
});
