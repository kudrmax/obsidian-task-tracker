import { afterEach, describe, expect, it, vi } from "vitest";
import { DESCRIPTION_TEMPLATE, type SearchGroup, StaleTaskError, TasksFileMissingError } from "../../core/application/contracts";
import type { Clock } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { TaskDocument } from "../../core/domain/TaskDocument";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-10-30";
const D = "2026-11-03";
const clock: Clock = { now: () => new Date(2026, 9, 30, 14, 20) };
const FULL = "## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B\n\n## Soon\n\n- [ ] C\n\n## Backlog\n\n## Done\n";

/** Each list's sections but their ids, which a test of what the sections are leaves aside. */
function unkeyed<S extends { readonly id: string }>(lists: Readonly<Record<string, readonly S[]>>): Record<string, Omit<S, "id">[]> {
	return Object.fromEntries(Object.entries(lists).map(([list, sections]) => [list, sections.map(({ id: _id, ...rest }) => rest)]));
}

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
		const { svc } = setup("## Now\n\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n- [/] B 📅 2026-11-03\n\n## Soon\n\n- [ ] C\n- [ ] D 📅 2026-11-03\n");
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
		const { svc } = setup("## Now\n\n- [ ] A\n\n## Soon\n\n- [ ] C\n- [ ] D 📅 2026-11-03\n- [ ] E ⏰ 2026-11-03 10:00-11:00\n");
		expect((await svc.soonWithoutDateView()).map((i) => i.text)).toEqual(["C"]);
	});

	it("dayView normalizes for reading without writing", async () => {
		const { store, svc } = setup("## Now\n\n- [x] Done\n- [ ] A ⏰ 2026-10-01 10:00-11:00\n\n## Soon\n\n- [ ] S 📅 2026-10-30\n\n## Done\n");
		const view = await svc.dayView(T);
		expect(view.list.map((i) => i.text)).toEqual(["S", "A"]);
		expect(view.list[1].slot).toBeNull();
		expect(store.writes).toBe(0);
	});
});

describe("writing", () => {
	it("setStatus done moves the task to Done in one write", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B\n\n## Soon\n\n## Done\n");
		const view = await svc.dayView(T);
		await svc.setStatus(view.list[0].key, "done");
		expect(store.writes).toBe(1);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] B\n\n## Soon\n\n## Done\n\n- [x] A\n\n## Backlog\n");
	});

	it("rejects a stale key and leaves the file alone", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A\n- [ ] B\n");
		const view = await svc.dayView(T);
		store.text = "## Now\n\n- [ ] Changed\n- [ ] B\n";
		await expect(svc.setStatus(view.list[0].key, "done")).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe("## Now\n\n- [ ] Changed\n- [ ] B\n");
		store.text = "## Now\n";
		await expect(svc.remove(view.list[1].key)).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe("## Now\n");
	});

	it("keys refer to the normalized file even before it was written", async () => {
		const { store, svc } = setup("## Now\n\n- [x] Old\n- [ ] A\n\n## Done\n");
		const view = await svc.dayView(T);
		expect(view.list[0].key).toEqual({ section: "now", index: 0, path: [], raw: "- [ ] A" });
		await svc.rename(view.list[0].key, "A2");
		expect(store.text).toBe("## Now\n\n- [ ] A2\n\n## Done\n\n- [x] Old\n\n## Inbox\n\n## Soon\n\n## Backlog\n");
	});

	it("adds the missing Inbox, Now, Soon, Backlog and Done on first write", async () => {
		const { store, svc } = setup("## Now\n");
		await svc.createInList(T, "A");
		expect(store.text).toBe("## Now\n\n- [ ] A 📅 2026-10-30\n\n## Inbox\n\n## Soon\n\n## Backlog\n\n## Done\n");
		await svc.createInSoon("S");
		expect(store.text).toBe("## Now\n\n- [ ] A 📅 2026-10-30\n\n## Inbox\n\n## Soon\n\n- [ ] S\n\n## Backlog\n\n## Done\n");
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
		expect(store.text).toBe("## In\n\n## Today\n\n## Next\n\n- [ ] A due: 2026-11-03\n\n## Finished\n\n## Later\n");
	});

	it("reads and keeps the alarm marker from settings", async () => {
		const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, alarmSlotMarker: "alarm:" });
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A alarm: 2026-10-30 10:00\n\n## Soon\n\n## Backlog\n\n## Done\n", settings);
		const view = await svc.dayView(T);
		expect(view.slotted.map((s) => s.text)).toEqual(["A"]);
		await svc.setSlot(view.slotted[0].key, { date: T, start: 660, end: null });
		expect(store.text).toContain("- [ ] A alarm: 2026-10-30 11:00");
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
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n\t- note\n- [ ] B\n\n## Soon\n\n## Backlog\n\n## Done\n");
		const [a, b] = (await svc.dayView(T)).list;
		expect(a.description).toBe("- note");
		expect(b.description).toBeNull();
		const before = store.text;
		await svc.setDescription(a.key, "- note");
		expect(store.text).toBe(before);
		await svc.setDescription(b.key, "- first\n\t- deeper");
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A\n\t- note\n- [ ] B\n\t- first\n\t\t- deeper\n\n## Soon\n\n## Backlog\n\n## Done\n");
	});

	it("takes a lone empty point, as the editor starts, for no description", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n\t- note\n- [ ] B\n\n## Soon\n\n## Backlog\n\n## Done\n");
		const [a, b] = (await svc.dayView(T)).list;
		const before = store.text;
		await svc.setDescription(b.key, DESCRIPTION_TEMPLATE);
		expect(store.text).toBe(before);
		await svc.setDescription(a.key, "  -  \n");
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B\n\n## Soon\n\n## Backlog\n\n## Done\n");
	});

	it("rejects a description for a task that changed in the file", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A\n");
		const view = await svc.dayView(T);
		store.text = "## Now\n\n- [ ] Changed\n";
		await expect(svc.setDescription(view.list[0].key, "- x")).rejects.toBeInstanceOf(StaleTaskError);
	});

	it("createAtTime puts the task at the time, without a duration", async () => {
		const { store, svc } = setup(FULL);
		await svc.createAtTime(T, 600, "Call");
		expect(store.text).toContain("## Now\n\n- [ ] A\n- [ ] B\n- [ ] Call 📌 2026-10-30 10:00\n");
		await svc.createAtTime(D, 1420, "Late");
		expect(store.text).toContain("## Soon\n\n- [ ] C\n- [ ] Late 📌 2026-11-03 23:40\n");
	});

	it("normalizes after every write", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n\n## Soon\n\n- [ ] S\n\n## Done\n");
		const soon = await svc.soonWithoutDateView();
		await svc.setDueDate(soon[0].key, T);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] S 📅 2026-10-30\n- [ ] A\n\n## Soon\n\n## Done\n\n## Backlog\n");
	});

	it("moves tasks between the list, Soon and the timeline", async () => {
		const { store, svc } = setup(FULL);
		let view = await svc.dayView(T);
		await svc.setSlot(view.list[0].key, { date: T, start: 600, end: 660 });
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A 📌 2026-10-30 10:00-11:00\n- [ ] B\n\n## Soon\n\n- [ ] C\n\n## Backlog\n\n## Done\n");
		view = await svc.dayView(T);
		await svc.clearSlot(view.slotted[0].key);
		expect(store.text).toBe(FULL);
		const soon = await svc.soonWithoutDateView();
		await svc.moveToList(soon[0].key, T);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B\n- [ ] C 📅 2026-10-30\n\n## Soon\n\n## Backlog\n\n## Done\n");
		view = await svc.dayView(T);
		await svc.moveToSoon(view.list[0].key, T);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] B\n- [ ] C 📅 2026-10-30\n\n## Soon\n\n- [ ] A\n\n## Backlog\n\n## Done\n");
		view = await svc.dayView(T);
		await svc.moveBefore(view.list[1].key, view.list[0].key, T);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] C 📅 2026-10-30\n- [ ] B\n\n## Soon\n\n- [ ] A\n\n## Backlog\n\n## Done\n");
		view = await svc.dayView(T);
		await svc.remove(view.list[0].key);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] B\n\n## Soon\n\n- [ ] A\n\n## Backlog\n\n## Done\n");
	});

	it("clearSlot with a place puts the task where it was dropped on the list", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A ⏰ 2026-10-30 10:00\n- [ ] B\n- [ ] C\n\n## Soon\n\n## Done\n");
		let view = await svc.dayView(T);
		await svc.clearSlot(view.slotted[0].key, { before: null, date: T });
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] B\n- [ ] C\n- [ ] A 📅 2026-10-30\n\n## Soon\n\n## Done\n\n## Backlog\n");
		await svc.setSlot((await svc.dayView(T)).list[2].key, { date: T, start: 600, end: null });
		view = await svc.dayView(T);
		await svc.clearSlot(view.slotted[0].key, { before: view.list[1].key, date: T });
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] B\n- [ ] A 📅 2026-10-30\n- [ ] C\n\n## Soon\n\n## Done\n\n## Backlog\n");
	});

	it("normalize writes only when a rule changed something", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n\n## Soon\n\n## Done\n");
		await svc.normalize();
		expect(store.writes).toBe(0);
		store.text = "## Inbox\n\n## Now\n\n- [x] A\n\n## Soon\n\n## Done\n";
		await svc.normalize();
		expect(store.writes).toBe(1);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n## Soon\n\n## Done\n\n- [x] A\n\n## Backlog\n");
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
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B\n- [ ] N 📅 2026-10-30\n- [ ] P 📅 2026-10-30\n\n## Soon\n\n- [ ] C\n- [ ] S\n- [ ] D 📅 2026-11-03 📌 2026-11-03 10:00-11:00\n\n## Backlog\n\n## Done\n");
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
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A2\n- [ ] B\n\n## Soon\n\n- [ ] C\n\n## Backlog\n\n## Done\n");
	});

	it("edit with another placement moves the task", async () => {
		const { store, svc } = setup(FULL);
		const view = await svc.dayView(T);
		await svc.edit(view.list[0].key, { text: "A", placement: { kind: "soon" }, priority: null });
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] B\n\n## Soon\n\n- [ ] C\n- [ ] A\n\n## Backlog\n\n## Done\n");
	});

	it("edit answers with the task as it now stands, its key fresh, where it went; null when nothing was written", async () => {
		const { svc } = setup(FULL);
		const view = await svc.dayView(T);
		const renamed = await svc.edit(view.list[0].key, { text: "  A2 ", placement: { kind: "now" }, priority: null });
		expect([renamed?.text, renamed?.key]).toEqual(["A2", { section: "now", index: 0, path: [], raw: "- [ ] A2" }]);
		const moved = await svc.edit(renamed!.key, { text: "A3", placement: { kind: "soon" }, priority: null });
		expect([moved?.text, moved?.key]).toEqual(["A3", { section: "soon", index: 1, path: [], raw: "- [ ] A3" }]);
		expect(await svc.edit(moved!.key, { text: "A3", placement: { kind: "soon" }, priority: null })).toBeNull();
	});

	it("edit of a title that is only a priority's prefix writes nothing, as create and rename", async () => {
		const { store, svc } = setup(FULL);
		const view = await svc.dayView(T);
		expect(await svc.edit(view.list[0].key, { text: "p1 ", placement: { kind: "now" }, priority: null })).toBeNull();
		expect(await svc.rename(view.list[0].key, "p1 ")).toBeNull();
		expect(await svc.createInPlace("p1 ", null, { kind: "list", list: "now", group: null, before: null })).toBeNull();
		expect(store.writes).toBe(0);
	});

	it("edit with blank text writes nothing and a stale key is rejected", async () => {
		const { store, svc } = setup(FULL);
		const view = await svc.dayView(T);
		await svc.edit(view.list[0].key, { text: "", placement: { kind: "soon" }, priority: null });
		expect(store.writes).toBe(0);
		store.text = "## Now\n\n- [ ] Changed\n";
		await expect(svc.edit(view.list[0].key, { text: "X", placement: { kind: "soon" }, priority: null })).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe("## Now\n\n- [ ] Changed\n");
	});

	it("placementOf returns now for today's due date, the date for another one, else the section", async () => {
		const { svc } = setup("## Now\n\n- [ ] A 📅 2026-11-03\n- [ ] B\n- [ ] C 📅 2026-10-30\n\n## Soon\n\n- [ ] S\n");
		const view = await svc.dayView(T);
		expect(svc.placementOf(view.list[0])).toEqual({ kind: "date", date: D });
		expect(svc.placementOf(view.list[1])).toEqual({ kind: "now" });
		expect(svc.placementOf(view.list[2])).toEqual({ kind: "now" });
		expect(svc.placementOf((await svc.soonWithoutDateView())[0])).toEqual({ kind: "soon" });
	});
});

describe("the day column and the day of a placement", () => {
	const { svc } = setup(FULL);

	it("a column's sections: Inbox, Backlog and Soon their own, the day column its day's list, none for a past day", () => {
		expect(svc.columnSections("inbox", D)).toEqual({ list: "inbox", date: null });
		expect(svc.columnSections("backlog", "2026-10-28")).toEqual({ list: "backlog", date: null });
		expect(svc.columnSections("soon", T)).toEqual({ list: "soon", date: null });
		expect(svc.columnSections("day", T)).toEqual({ list: "now", date: null });
		expect(svc.columnSections("day", D)).toEqual({ list: "soon", date: D });
		expect(svc.columnSections("day", "2026-10-28")).toBeNull();
	});

	it("today is Now with sections, a later day Soon with that day, a past day Now with that day and no sections", () => {
		expect(svc.dayColumn(T)).toEqual({ list: "now", date: null, sections: true });
		expect(svc.dayColumn(D)).toEqual({ list: "soon", date: D, sections: true });
		expect(svc.dayColumn("2026-10-28")).toEqual({ list: "now", date: "2026-10-28", sections: false });
	});

	it("a day's placement is Now for today, the day otherwise; Now's day is today", () => {
		expect(svc.placementOfDay(T)).toEqual({ kind: "now" });
		expect(svc.placementOfDay(D)).toEqual({ kind: "date", date: D });
		expect(svc.dayOfPlacement({ kind: "now" })).toBe(T);
		expect(svc.dayOfPlacement({ kind: "date", date: D })).toBe(D);
		expect(svc.dayOfPlacement({ kind: "soon" })).toBeNull();
	});

	it("a list goes by its section's name in the settings, renamed or not", () => {
		const { svc } = setup(FULL);
		expect(svc.listName("inbox")).toBe("Inbox");
		expect(svc.listName("done")).toBe("Done");
		expect(svc.listName("backlog")).toBe("Backlog");
		expect(svc.listName("soon")).toBe("Soon");
		expect(svc.listName("now")).toBe("Now");
		const sections = { inbox: "Входящие", now: "Сейчас", soon: "Скоро", backlog: "Когда-нибудь", done: "Готово" };
		const renamed = setup(FULL, new FakeSettingsStore({ ...DEFAULT_SETTINGS, sections })).svc;
		expect(renamed.listName("inbox")).toBe("Входящие");
		expect(renamed.listName("backlog")).toBe("Когда-нибудь");
		expect(renamed.listName("soon")).toBe("Скоро");
		expect(renamed.listName("now")).toBe("Сейчас");
	});

	it("names a placement for the quick entry's place button: the list's name, a day as `5 Nov`", () => {
		const sections = { ...DEFAULT_SETTINGS.sections, inbox: "Входящие" };
		const { svc } = setup(FULL, new FakeSettingsStore({ ...DEFAULT_SETTINGS, sections }));
		expect(svc.placementTitle({ kind: "inbox" })).toBe("Входящие");
		expect(svc.placementTitle({ kind: "now" })).toBe("Now");
		expect(svc.placementTitle({ kind: "date", date: "2026-11-05" })).toBe("5 Nov");
	});

	it("today follows the hour the day starts at", () => {
		const night = new TaskServiceImpl(new InMemoryTaskFileStore(FULL), new FakeSettingsStore({ ...DEFAULT_SETTINGS, dayStartHour: 4 }), { now: () => new Date(2026, 9, 31, 2, 0) });
		expect(night.dayColumn(T)).toEqual({ list: "now", date: null, sections: true });
		expect(night.placementOfDay("2026-10-31")).toEqual({ kind: "date", date: "2026-10-31" });
	});

	it("an item read tells its day and what may be done to it on today", async () => {
		const { svc: read } = setup("## Now\n\n- [ ] A 📅 2026-11-03\n- [ ] B 📅 2026-10-30\n\n## Soon\n\n- [ ] C 📅 2026-11-03\n");
		const view = await read.dayView(T);
		expect(view.list.map((i) => [i.day, i.can.removeDue])).toEqual([[T, true], [T, false]]);
		expect((await read.dayView(D)).list.map((i) => [i.text, i.day, i.can.removeDue])).toEqual([["A", T, true], ["C", D, true]]);
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

	it("fires when a setting the file is read by changes, not for another one, and no more once unsubscribed", async () => {
		const settings = new FakeSettingsStore();
		const { svc } = setup(FULL, settings);
		let fired = 0;
		const off = svc.onChange(() => fired++);
		await settings.update({ longPressMs: 400 });
		await settings.update({ dayStartHour: 3 });
		expect(fired).toBe(0);
		await settings.update({ dueDateMarker: "🗓" });
		expect(fired).toBe(1);
		await settings.update({ sections: { ...DEFAULT_SETTINGS.sections, soon: "Later" } });
		expect(fired).toBe(2);
		off();
		await settings.update({ tasksFile: "Other.md" });
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
		const store = new InMemoryTaskFileStore("## Inbox\n\n## Now\n\n## Soon\n\n- [ ] Due 📅 2026-10-31\n");
		const svc = new TaskServiceImpl(store, settings(), night);
		await svc.createInList(T, "Late");
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] Late 📅 2026-10-30\n\n## Soon\n\n- [ ] Due 📅 2026-10-31\n\n## Backlog\n\n## Done\n");
	});

	it("the day's timeline takes the slots after midnight and a slot there keeps a Now task in Now", async () => {
		const store = new InMemoryTaskFileStore("## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B ⏰ 2026-10-31 01:00-02:00\n\n## Soon\n\n## Done\n");
		const svc = new TaskServiceImpl(store, settings(), night);
		const day = await svc.dayView(T);
		expect(day.slotted.map((i) => i.text)).toEqual(["B"]);
		await svc.setSlot(day.list[0].key, { date: "2026-10-31", start: 180, end: 300 });
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A 📌 2026-10-31 03:00-04:00\n- [ ] B ⏰ 2026-10-31 01:00-02:00\n\n## Soon\n\n## Done\n\n## Backlog\n");
	});
});

describe("Inbox", () => {
	it("inboxView lists the Inbox tasks with their keys and the Inbox placement", async () => {
		const { svc } = setup("## Inbox\n\n- [ ] I\n- [/] J\n\n## Now\n\n- [ ] A\n\n## Soon\n\n- [ ] C\n");
		const inbox = await svc.inboxView();
		expect(inbox.map((i) => i.text)).toEqual(["I", "J"]);
		expect(inbox[1].key).toEqual({ section: "inbox", index: 1, path: [], raw: "- [/] J" });
		expect(svc.placementOf(inbox[0])).toEqual({ kind: "inbox" });
		expect((await svc.dayView(T)).list.map((i) => i.text)).toEqual(["A"]);
	});

	it("the Inbox tile creates at the end of Inbox", async () => {
		const { store, svc } = setup(FULL);
		await svc.create({ text: "New", placement: { kind: "inbox" }, priority: null });
		expect(store.text).toBe("## Inbox\n\n- [ ] New\n\n## Now\n\n- [ ] A\n- [ ] B\n\n## Soon\n\n- [ ] C\n\n## Backlog\n\n## Done\n");
	});

	it("a due date from the menu takes the task out of Inbox", async () => {
		const { store, svc } = setup("## Inbox\n\n- [ ] I\n\n## Now\n\n- [ ] A\n\n## Soon\n\n- [ ] C\n\n## Done\n");
		await svc.setDueDate((await svc.inboxView())[0].key, D);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A\n\n## Soon\n\n- [ ] C\n- [ ] I 📅 2026-11-03\n\n## Done\n\n## Backlog\n");
	});

	it("moveToEnd drags between Inbox and Soon", async () => {
		const { store, svc } = setup("## Inbox\n\n- [ ] I\n\n## Now\n\n## Soon\n\n- [ ] C\n- [ ] E\n\n## Done\n");
		await svc.moveToEnd((await svc.inboxView())[0].key, "soon");
		expect(store.text).toBe("## Inbox\n\n## Now\n\n## Soon\n\n- [ ] C\n- [ ] E\n- [ ] I\n\n## Done\n\n## Backlog\n");
		await svc.moveToEnd((await svc.soonWithoutDateView())[0].key, "inbox");
		expect(store.text).toBe("## Inbox\n\n- [ ] C\n\n## Now\n\n## Soon\n\n- [ ] E\n- [ ] I\n\n## Done\n\n## Backlog\n");
		await svc.moveToEnd((await svc.soonWithoutDateView())[0].key, "soon");
		expect(store.text).toBe("## Inbox\n\n- [ ] C\n\n## Now\n\n## Soon\n\n- [ ] I\n- [ ] E\n\n## Done\n\n## Backlog\n");
	});

	it("adds missing Inbox and Backlog headings at the end on the first write", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A\n\n## Soon\n\n## Done\n");
		await svc.createInSoon("S");
		expect(store.text).toBe("## Now\n\n- [ ] A\n\n## Soon\n\n- [ ] S\n\n## Done\n\n## Inbox\n\n## Backlog\n");
	});
});

describe("Backlog", () => {
	it("backlogView lists the Backlog tasks with their keys and the Backlog placement", async () => {
		const { svc } = setup("## Inbox\n\n- [ ] I\n\n## Now\n\n- [ ] A\n\n## Soon\n\n## Backlog\n\n- [ ] L\n### Дом\n- [ ] M\n\n## Done\n");
		const backlog = await svc.backlogView();
		expect(backlog.map((i) => [i.text, i.group])).toEqual([["L", null], ["M", "Дом"]]);
		expect(backlog[1].key).toEqual({ section: "backlog", index: 1, path: [], raw: "- [ ] M" });
		expect(svc.placementOf(backlog[0])).toEqual({ kind: "backlog" });
	});

	it("a due date from the menu takes the task out of Backlog to Soon", async () => {
		const { store, svc } = setup(FULL.replace("## Backlog\n", "## Backlog\n\n- [ ] L\n"));
		await svc.setDueDate((await svc.backlogView())[0].key, D);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B\n\n## Soon\n\n- [ ] C\n- [ ] L 📅 2026-11-03\n\n## Backlog\n\n## Done\n");
	});

	it("moveToGroup puts an Inbox task into a section of Backlog", async () => {
		const { store, svc } = setup("## Inbox\n\n- [ ] I\n\n## Now\n\n## Soon\n\n## Backlog\n\n- [ ] L\n### Дом\n- [ ] M\n\n## Done\n");
		await svc.moveToGroup((await svc.inboxView())[0].key, "backlog", "Дом", null);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n## Soon\n\n## Backlog\n\n- [ ] L\n### Дом\n- [ ] M\n- [ ] I\n\n## Done\n");
	});
});

describe("priority", () => {
	const withLevels = (priorities: typeof DEFAULT_SETTINGS.priorities) => new FakeSettingsStore({ ...DEFAULT_SETTINGS, priorities });

	it("gives an item its level and the text without the prefix", async () => {
		const { svc } = setup("## Now\n\n- [ ] p1 A\n- [ ] B\n");
		const view = await svc.dayView(T);
		expect(view.list[0]).toMatchObject({ text: "A", priority: { prefix: "p1", color: "red" } });
		expect(view.list[1].priority).toBeNull();
	});

	it("setReminder writes the kind's marker before the time, and the item carries the kind", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A ⏰ 2026-10-30 10:00\n\n## Soon\n\n## Done\n");
		await svc.setReminder((await svc.dayView(T)).slotted[0].key, "alarm");
		expect(store.text).toContain("- [ ] A 🚨 2026-10-30 10:00");
		expect((await svc.dayView(T)).slotted[0].reminder).toBe("alarm");
	});

	it("setCollapsed writes the marker on the task's line and the item says so; false takes it off", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n\t- [ ] B\n\n## Soon\n\n## Done\n");
		await svc.setCollapsed((await svc.dayView(T)).list[0].key, true);
		expect(store.text).toContain("- [ ] A 📁\n\t- [ ] B\n");
		expect((await svc.dayView(T)).list[0]).toMatchObject({ collapsed: true, subtasks: [{ text: "B" }] });
		await svc.setCollapsed((await svc.dayView(T)).list[0].key, false);
		expect(store.text).toContain("- [ ] A\n\t- [ ] B\n");
	});

	it("toggleCollapsed folds a task's subtasks away, and shows them again", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n\t- [ ] B\n\n## Soon\n\n## Done\n");
		await svc.toggleCollapsed((await svc.dayView(T)).list[0].key);
		expect(store.text).toContain("- [ ] A 📁\n\t- [ ] B\n");
		await svc.toggleCollapsed((await svc.dayView(T)).list[0].key);
		expect(store.text).toContain("- [ ] A\n\t- [ ] B\n");
	});

	it("can.resize: a task on the timeline only", async () => {
		const { svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B ⏰ 2026-10-30 10:00-11:00\n\n## Soon\n\n## Done\n");
		const day = await svc.dayView(T);
		expect(day.list[0].can.resize).toBe(false);
		expect(day.slotted[0].can.resize).toBe(true);
	});

	it("snap: a minute to the nearest step of the zoom, within the day", () => {
		const { svc } = setup("");
		expect(svc.snap(617, 56, 9)).toBe(615);
		expect(svc.snap(617, 28, 9)).toBe(630);
		expect(svc.snap(2000, 112, 9)).toBe(1440);
	});

	it("unfoldAbove shows the subtasks of every task a subtask sits under", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A 📁\n\t- [ ] B 📁\n\t\t- [ ] C\n\n## Soon\n\n## Done\n");
		await svc.unfoldAbove((await svc.dayView(T)).list[0].subtasks[0].subtasks[0].key);
		expect(store.text).toContain("- [ ] A\n\t- [ ] B\n\t\t- [ ] C\n");
	});

	it("setPriority writes the prefix, null takes it off", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] p1 A\n\n## Soon\n\n## Done\n");
		await svc.setPriority((await svc.dayView(T)).list[0].key, "p2");
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] p2 A\n\n## Soon\n\n## Done\n\n## Backlog\n");
		await svc.setPriority((await svc.dayView(T)).list[0].key, null);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A\n\n## Soon\n\n## Done\n\n## Backlog\n");
	});

	it("reads a prefix no level has as text, and leaves the line alone", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] p1 A\n- [ ] B\n\n## Soon\n\n## Done\n", withLevels([]));
		const view = await svc.dayView(T);
		expect(view.list[0]).toMatchObject({ text: "p1 A", priority: null });
		await svc.rename(view.list[1].key, "C");
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] p1 A\n- [ ] C\n\n## Soon\n\n## Done\n\n## Backlog\n");
	});

	it("takes the first of two levels with one prefix, and ignores a prefix with a space", async () => {
		const { svc } = setup("## Now\n\n- [ ] p1 A\n- [ ] x y B\n", withLevels([
			{ prefix: "p1", color: "blue" },
			{ prefix: "p1", color: "red" },
			{ prefix: "x y", color: "green" },
		]));
		const view = await svc.dayView(T);
		expect(view.list[0].priority).toEqual({ prefix: "p1", color: "blue" });
		expect(view.list[1]).toMatchObject({ text: "x y B", priority: null });
	});
});

describe("priority in a typed title", () => {
	const LEVELS = [
		{ prefix: "p1", color: "red" },
		{ prefix: "", color: "green" },
		{ prefix: "x y", color: "teal" },
		{ prefix: "p1", color: "blue" },
		{ prefix: "p2", color: "orange" },
	] as const;
	const withLevels = () => new FakeSettingsStore({ ...DEFAULT_SETTINGS, priorities: LEVELS });
	const EMPTY = "## Inbox\n\n## Now\n\n## Soon\n\n## Backlog\n\n## Done\n";
	const NOW = { kind: "list", list: "now", group: null, before: null } as const;

	it("offers the levels that mark tasks, in the settings' order: one-word prefixes, the first of two alike", () => {
		const { svc } = setup(EMPTY, withLevels());
		expect(svc.priorityLevels()).toEqual([
			{ prefix: "p1", color: "red" },
			{ prefix: "p2", color: "orange" },
		]);
	});

	it("reads a typed title's level with its colour, and the title without the prefix", () => {
		const { svc } = setup(EMPTY, withLevels());
		expect(svc.parseTitle("p2 Call")).toEqual({ priority: { prefix: "p2", color: "orange" }, text: "Call" });
		expect(svc.parseTitle("x y Call")).toEqual({ priority: null, text: "x y Call" });
	});

	it("puts a level first in place of the typed one, or takes it off", () => {
		const { svc } = setup(EMPTY, withLevels());
		expect(svc.withPriority("p1 Call", "p2")).toBe("p2 Call");
		expect(svc.withPriority("p1 Call", null)).toBe("Call");
	});

	it("creates nothing from a level's prefix alone, but a prefix without its space is a task", async () => {
		const { store, svc } = setup(EMPTY, withLevels());
		expect(await svc.createInPlace("p1 ", null, NOW)).toBeNull();
		await svc.create({ text: "p2 ", placement: { kind: "now" }, priority: null });
		await svc.createInSoon("p1\t");
		expect(store.writes).toBe(0);
		await svc.createInPlace("p1", null, NOW);
		expect((await svc.dayView(T)).list.map((i) => [i.text, i.priority])).toEqual([["p1", null]]);
	});

	it("answers for the field as the file reads what it writes", async () => {
		for (const typed of ["p1 x", "p1\tx", "p1  x", "p1 ", "p1", "p1x", "x"]) {
			const { store, svc } = setup(EMPTY, withLevels());
			const field = { ...svc.parseTitle(typed), blank: svc.isBlank(typed) };
			await svc.createInPlace(typed, null, NOW);
			const written = (await svc.dayView(T)).list[0];
			const file = written ? { priority: written.priority, text: written.text, blank: false } : { blank: store.writes === 0 };
			expect(field.blank, typed).toBe(file.blank);
			if (!field.blank) expect({ priority: field.priority, text: field.text }, typed).toEqual({ priority: file.priority, text: file.text });
		}
	});
});

describe("postpone", () => {
	it("takes a task off today: the due date, no time, the end of Soon", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n- [ ] B\n\n## Soon\n\n- [ ] C\n\n## Backlog\n\n## Done\n");
		const view = await svc.dayView(T);
		await svc.postpone(view.slotted[0].key, "2026-10-31");
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] B\n\n## Soon\n\n- [ ] C\n- [ ] A 📅 2026-10-31\n\n## Backlog\n\n## Done\n");
	});
});

describe("sections", () => {
	const TEXT = "## Inbox\n\n## Now\n\n- [ ] A\n### X\n- [ ] B\n\n## Soon\n\n- [ ] C\n\n## Done\n";

	it("items carry their section", async () => {
		const { svc } = setup(TEXT);
		expect((await svc.dayView(T)).list.map((i) => i.group)).toEqual([null, "X"]);
	});

	it("createGroup makes a section from a drop and normalizes", async () => {
		const { store, svc } = setup(TEXT);
		const [c] = await svc.soonWithoutDateView();
		await svc.createGroup(c.key, "now", "Evening");
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A\n### X\n- [ ] B\n### Evening\n- [ ] C 📅 2026-10-30\n\n## Soon\n\n## Done\n\n## Backlog\n");
	});

	it("reads the No section heading by the name in settings", async () => {
		const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, groups: { presets: [], ungrouped: "Без секции" } });
		const { svc } = setup("## Now\n\n### X\n- [ ] B\n### Без секции\n- [ ] A\n", settings);
		expect((await svc.dayView(T)).list.map((i) => [i.text, i.group])).toEqual([["B", "X"], ["A", null]]);
	});

	it("renameGroup takes the name as typed: trimmed, a blank one or the section's own writing nothing", async () => {
		const { store, svc } = setup("## Now\n\n### X\n- [ ] B\n");
		await svc.renameGroup("now", "X", "  ");
		await svc.renameGroup("now", "X", " X ");
		expect(store.writes).toBe(0);
		await svc.renameGroup("now", "X", " Вечер ");
		expect(store.text).toContain("### Вечер\n");
	});

	it("moveToGroup, renameGroup, removeGroup and moveGroup write once each", async () => {
		const { store, svc } = setup(TEXT);
		const [a] = (await svc.dayView(T)).list;
		await svc.moveToGroup(a.key, "now", "X", null);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n### X\n- [ ] B\n- [ ] A 📅 2026-10-30\n\n## Soon\n\n- [ ] C\n\n## Done\n\n## Backlog\n");
		await svc.renameGroup("now", "X", "Вечер");
		expect(store.text).toContain("### Вечер\n");
		await svc.removeGroup("now", "Вечер");
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] B\n- [ ] A 📅 2026-10-30\n\n## Soon\n\n- [ ] C\n\n## Done\n\n## Backlog\n");
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
	const TEXT = "## Inbox\n\n## Now\n\n- [ ] A\n### X\n- [ ] B\n\n## Soon\n\n- [ ] C\n\n## Done\n";

	it("list before a key writes once and puts the task there with the list's rules", async () => {
		const { store, svc } = setup(TEXT);
		const [, b] = (await svc.dayView(T)).list;
		await svc.createInPlace("N", "p1", { kind: "list", list: "now", group: "X", before: b.key });
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A\n### X\n- [ ] p1 N 📅 2026-10-30\n- [ ] B\n\n## Soon\n\n- [ ] C\n\n## Done\n\n## Backlog\n");
		expect(store.writes).toBe(1);
	});

	it("list with a date puts a later day in Soon with that due date", async () => {
		const { store, svc } = setup(TEXT);
		await svc.createInPlace("N", null, { kind: "list", list: "soon", group: null, before: null, date: D });
		expect(store.text).toContain("## Soon\n\n- [ ] C\n- [ ] N 📅 2026-11-03\n");
	});

	it("day: today goes in Now with today's due date, before the key, in its section", async () => {
		const { store, svc } = setup(TEXT);
		const [, b] = (await svc.dayView(T)).list;
		await svc.createInPlace("N", null, { kind: "day", date: T, group: "X", before: b.key });
		expect(store.text).toContain("## Now\n\n- [ ] A\n### X\n- [ ] N 📅 2026-10-30\n- [ ] B\n");
	});

	it("day: a later day goes in Soon with that due date", async () => {
		const { store, svc } = setup(TEXT);
		await svc.createInPlace("N", null, { kind: "day", date: D, group: null, before: null });
		expect(store.text).toContain("## Soon\n\n- [ ] C\n- [ ] N 📅 2026-11-03\n");
	});

	it("day: a past day goes in Now, which gives it today's due date", async () => {
		const { store, svc } = setup(TEXT);
		await svc.createInPlace("N", null, { kind: "day", date: "2026-10-28", group: null, before: null });
		expect(store.text).toContain("## Now\n\n- [ ] A\n- [ ] N 📅 2026-10-30\n### X\n");
	});

	it("day in a section of its list missing from the file rejects with StaleTaskError", async () => {
		const { store, svc } = setup(TEXT);
		await expect(svc.createInPlace("N", null, { kind: "day", date: D, group: "X", before: null })).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe(TEXT);
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
		const TRIP = "## Inbox\n\n## Now\n\n- [ ] Trip\n\t- [ ] Compare\n\t- [ ] Pay\n\n## Soon\n\n## Done\n";
		const { store, svc } = setup(TRIP);
		const [trip] = (await svc.dayView(T)).list;
		const pay = trip.subtasks[1];
		await svc.createInPlace("Bag", null, { kind: "subtask", parent: trip.key, before: pay.key });
		expect(store.text).toContain("\t- [ ] Compare\n\t- [ ] Bag\n\t- [ ] Pay\n");
		await svc.createInPlace("Last", "p2", { kind: "subtask", parent: trip.key, before: null });
		expect(store.text).toContain("\t- [ ] Pay\n\t- [ ] p2 Last\n");
		expect(store.writes).toBe(2);
	});

	it("gives the key of the task it created, as the file stands after the write", async () => {
		const { svc } = setup(TEXT);
		const [, b] = (await svc.dayView(T)).list;
		const key = await svc.createInPlace("N", "p1", { kind: "list", list: "now", group: "X", before: b.key });
		expect(key).toEqual((await svc.dayView(T)).list.find((i) => i.text === "N")!.key);
	});

	it("gives the key where normalizing moved the task: a schedule typed in Inbox lands in Soon", async () => {
		const { svc } = setup(TEXT);
		const key = await svc.createInPlace("Run", null, { kind: "list", list: "inbox", group: null, before: null }, { kind: "schedule", every: 1, unit: "week", days: [3], dayOfMonth: null, from: null });
		const run = (await svc.dayView("2026-11-05")).list.find((i) => i.text === "Run")!;
		expect([key, (await svc.inboxView()).length]).toEqual([run.key, 0]);
		expect(key!.section).toBe("soon");
	});

	it("gives a subtask's key", async () => {
		const TRIP = "## Inbox\n\n## Now\n\n- [ ] Trip\n\t- [ ] Bag\n\n## Soon\n\n## Done\n";
		const { svc } = setup(TRIP);
		const [trip] = (await svc.dayView(T)).list;
		const key = await svc.createInPlace("Pay", null, { kind: "subtask", parent: trip.key, before: null });
		expect(key).toEqual((await svc.dayView(T)).list[0].subtasks[1].key);
	});

	it("gives the new task, not its twin in another section: the headings keep them apart", async () => {
		const { svc } = setup("## Inbox\n\n## Now\n\n## Soon\n\n## Done\n\n## Backlog\n\n- [ ] Call mom\n");
		const key = await svc.createInPlace("Call mom", null, { kind: "list", list: "inbox", group: null, before: null });
		expect(key).toEqual((await svc.inboxView())[0].key);
	});

	it("gives the new task typed above its twin in the same section", async () => {
		const { svc } = setup("## Inbox\n\n- [ ] X\n\n## Now\n\n## Soon\n\n## Done\n\n## Backlog\n");
		const [x] = await svc.inboxView();
		const key = await svc.createInPlace("X", null, { kind: "list", list: "inbox", group: null, before: x.key });
		expect(key).toEqual((await svc.inboxView())[0].key);
	});

	it("gives the very twin typed, side by side with the other: the write knows which line it made", async () => {
		const { svc } = setup("## Inbox\n\n- [ ] X\n- [ ] Y\n\n## Now\n\n## Soon\n\n## Done\n\n## Backlog\n");
		const [x, y] = await svc.inboxView();
		const key = await svc.createInPlace("X", null, { kind: "list", list: "inbox", group: null, before: y.key });
		const inbox = await svc.inboxView();
		expect(inbox.map((i) => i.text)).toEqual(["X", "X", "Y"]);
		expect(key).toEqual(inbox[1].key);
		expect(inbox[0].id).toBe(x.id);
		expect(inbox[1].id).not.toBe(x.id);
	});

	it("gives the twin a schedule moved out of Inbox, with an identical task left behind", async () => {
		const { svc } = setup("## Inbox\n\n- [ ] Run\n\n## Now\n\n## Soon\n\n## Done\n\n## Backlog\n");
		const key = await svc.createInPlace("Run", null, { kind: "list", list: "inbox", group: null, before: null }, { kind: "schedule", every: 1, unit: "week", days: [3], dayOfMonth: null, from: null });
		const run = (await svc.dayView("2026-11-05")).list.find((i) => i.text === "Run")!;
		expect(key).toEqual(run.key);
	});

	it("gives null when it creates nothing", async () => {
		const { svc } = setup(TEXT);
		expect(await svc.createInPlace("  ", null, { kind: "list", list: "now", group: null, before: null })).toBeNull();
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
	const TRIP = "## Inbox\n\n## Now\n\n- [ ] Trip\n\t- [x] Compare\n\t- [ ] Pay\n- [ ] Call\n\n## Soon\n\n## Done\n";

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
	const TEXT = "## Inbox\n\n## Now\n\n- [ ] A\n\n## Soon\n\n## Done\n";

	it("planned in the evening for tomorrow, the task is in the same section of Now when tomorrow comes", async () => {
		const evening = setup(TEXT);
		const [a] = (await evening.svc.dayView(T)).list;
		await evening.svc.createGroup(a.key, "soon", "Morning", "2026-10-31");
		expect(evening.store.text).toBe("## Inbox\n\n## Now\n\n## Soon\n\n### Morning\n- [ ] A 📅 2026-10-31\n\n## Done\n\n## Backlog\n");
		expect((await evening.svc.dayView("2026-10-31")).list.map((i) => [i.text, i.group])).toEqual([["A", "Morning"]]);
		const morning = new TaskServiceImpl(evening.store, new FakeSettingsStore(), { now: () => new Date(2026, 9, 31, 9, 0) });
		expect((await morning.dayView("2026-10-31")).list.map((i) => [i.text, i.group])).toEqual([["A", "Morning"]]);
		await morning.normalize();
		expect(evening.store.text).toBe("## Inbox\n\n## Now\n\n### Morning\n- [ ] A 📅 2026-10-31\n\n## Soon\n\n## Done\n\n## Backlog\n");
	});
});

describe("lineOf", () => {
	it("gives the line of a task and of a subtask, from 0", async () => {
		const { svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B\n\t- [ ] B1\n\n## Soon\n\n- [ ] C\n\n## Backlog\n\n## Done\n");
		const now = (await svc.dayView(T)).list;
		const b = now.find((i) => i.text === "B")!;
		expect(await svc.lineOf(b.key)).toBe(5);
		expect(await svc.lineOf(b.subtasks[0].key)).toBe(6);
		const c = (await svc.soonWithoutDateView())[0];
		expect(await svc.lineOf(c.key)).toBe(10);
	});

	it("rejects with StaleTaskError when the line changed", async () => {
		const { svc } = setup(FULL);
		const a = (await svc.dayView(T)).list[0];
		await expect(svc.lineOf({ ...a.key, raw: "- [ ] Other" })).rejects.toBeInstanceOf(StaleTaskError);
	});
});

describe("find", () => {
	const TREE = "## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B\n\t- [x] B1\n\t- [ ] B2\n\n## Soon\n\n## Backlog\n\n## Done\n";

	it("gives the task at its place with every subtask, a subtask with the text of its task", async () => {
		const { svc } = setup(TREE);
		const b = (await svc.dayView(T)).list.find((i) => i.text === "B")!;
		const found = await svc.find(b.key, b.text);
		expect(found?.allSubtasks.map((s) => [s.text, s.status])).toEqual([["B1", "done"], ["B2", "todo"]]);
		expect((await svc.find(b.allSubtasks[1].key, "B2"))?.parentText).toBe("B");
	});

	it("follows the task to where it moved, its line the same", async () => {
		const { svc } = setup(TREE);
		const [a, b] = (await svc.dayView(T)).list;
		await svc.remove(a.key);
		expect((await svc.find(b.key, b.text))?.key.index).toBe(0);
	});

	it("keeps the task at its place whose text is the one asked for, its other fields changed", async () => {
		const { svc } = setup(TREE);
		const b = (await svc.dayView(T)).list[1];
		await svc.setPriority(b.key, "p1");
		expect((await svc.find(b.key, "B"))?.priority?.prefix).toBe("p1");
		await svc.rename((await svc.find(b.key, "B"))!.key, "Bee");
		expect((await svc.find(b.key, "Bee"))?.text).toBe("Bee");
	});

	it("gives null once the task is gone from its place and its line from the file", async () => {
		const { svc } = setup(TREE);
		const [a, b] = (await svc.dayView(T)).list;
		await svc.setStatus(a.key, "done");
		expect(await svc.find(a.key, a.text)).toBeNull();
		expect((await svc.find(b.key, b.text))?.text).toBe("B");
	});
});

describe("applyAll", () => {
	it("changes several tasks in one write", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B\n- [ ] C\n\n## Soon\n\n## Done\n");
		const [a, , c] = (await svc.dayView(T)).list;
		await svc.applyAll([a, c].map((item) => ({ key: item.key, change: { kind: "priority", priority: "p1" } as const })));
		expect(store.writes).toBe(1);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] p1 A\n- [ ] B\n- [ ] p1 C\n\n## Soon\n\n## Done\n\n## Backlog\n");
	});

	it("moves tasks to one place in the order they stood, whatever order the steps came in", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B\n- [ ] C\n- [ ] D\n\n## Soon\n\n## Done\n");
		const [a, b, , d] = (await svc.dayView(T)).list;
		await svc.applyAll([d, a].map((item) => ({ key: item.key, change: { kind: "moveBefore", before: b.key, date: T } as const })));
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A 📅 2026-10-30\n- [ ] D 📅 2026-10-30\n- [ ] B\n- [ ] C\n\n## Soon\n\n## Done\n\n## Backlog\n");
	});

	it("finds the task to stand before after the moves before it shifted it", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B\n- [ ] C\n- [ ] D\n\n## Soon\n\n## Done\n");
		const [a, b, , d] = (await svc.dayView(T)).list;
		await svc.applyAll([a, b].map((item) => ({ key: item.key, change: { kind: "moveBefore", before: d.key, date: T } as const })));
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] C\n- [ ] A 📅 2026-10-30\n- [ ] B 📅 2026-10-30\n- [ ] D\n\n## Soon\n\n## Done\n\n## Backlog\n");
	});

	it("tells twin tasks apart", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] X\n- [ ] A\n- [ ] X\n\n## Soon\n\n## Done\n");
		const [, a, x2] = (await svc.dayView(T)).list;
		await svc.applyAll([{ key: a.key, change: { kind: "moveToSoon", date: T } }, { key: x2.key, change: { kind: "status", status: "inProgress" } }]);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] X\n- [/] X\n\n## Soon\n\n- [ ] A\n\n## Done\n\n## Backlog\n");
	});

	it("postpones tasks from different lists and removes others in the same write", async () => {
		const { store, svc } = setup("## Inbox\n\n- [ ] I\n\n## Now\n\n- [ ] A\n- [ ] B\n\n## Soon\n\n- [ ] S\n\n## Done\n");
		const [a, b] = (await svc.dayView(T)).list;
		const [s] = await svc.soonWithoutDateView();
		await svc.applyAll([
			{ key: s.key, change: { kind: "postpone", date: D } },
			{ key: a.key, change: { kind: "postpone", date: D } },
			{ key: b.key, change: { kind: "remove" } },
		]);
		expect(store.writes).toBe(1);
		expect(store.text).toBe("## Inbox\n\n- [ ] I\n\n## Now\n\n## Soon\n\n- [ ] S 📅 2026-11-03\n- [ ] A 📅 2026-11-03\n\n## Done\n\n## Backlog\n");
	});

	it("moves a task with its subtasks once when both are chosen, but changes the status of each", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n\t- [ ] A1\n- [ ] B\n\n## Soon\n\n## Done\n");
		const [a] = (await svc.dayView(T)).list;
		const a1 = a.subtasks[0];
		await svc.applyAll([a, a1].map((item) => ({ key: item.key, change: { kind: "moveToSoon", date: T } as const })));
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] B\n\n## Soon\n\n- [ ] A\n\t- [ ] A1\n\n## Done\n\n## Backlog\n");
		const [moved] = await svc.soonWithoutDateView();
		await svc.applyAll([moved, moved.subtasks[0]].map((item) => ({ key: item.key, change: { kind: "status", status: "inProgress" } as const })));
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] B\n\n## Soon\n\n- [/] A\n\t- [/] A1\n\n## Done\n\n## Backlog\n");
	});

	it("skips a subtask already gone with its removed task", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n\t- [ ] A1\n- [ ] B\n\n## Soon\n\n## Done\n");
		const [a] = (await svc.dayView(T)).list;
		await svc.applyAll([a, a.subtasks[0]].map((item) => ({ key: item.key, change: { kind: "remove" } as const })));
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] B\n\n## Soon\n\n## Done\n\n## Backlog\n");
	});

	it("nests tasks under one parent in their order", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] P\n- [ ] A\n- [ ] B\n\n## Soon\n\n## Done\n");
		const [p, a, b] = (await svc.dayView(T)).list;
		await svc.applyAll([b, a].map((item) => ({ key: item.key, change: { kind: "nest", parent: p.key, before: null } as const })));
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] P\n\t- [ ] A\n\t- [ ] B\n\n## Soon\n\n## Done\n\n## Backlog\n");
	});

	it("rejects a stale key and writes nothing", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A\n- [ ] B\n");
		const [a, b] = (await svc.dayView(T)).list;
		store.text = "## Now\n\n- [ ] A\n- [ ] Changed\n";
		await expect(svc.applyAll([a, b].map((item) => ({ key: item.key, change: { kind: "remove" } as const })))).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe("## Now\n\n- [ ] A\n- [ ] Changed\n");
	});
});

describe("one parse per version of the file", () => {
	const TEXT = "## Inbox\n\n- [ ] I\n\n## Now\n\n- [ ] A\n- [/] B 📅 2026-10-30\n\n## Soon\n\n- [ ] C\n- [ ] D 📅 2026-11-03\n\n## Backlog\n\n## Done\n\n- [x] Old\n";

	afterEach(() => vi.restoreAllMocks());

	function views(svc: TaskServiceImpl) {
		return Promise.all([svc.dayView(T), svc.soonWithoutDateView(), svc.inboxView()]);
	}

	/** What a read gives but the tasks' ids, which last as long as the service that gave them. */
	function withoutIds(value: unknown): unknown {
		return JSON.parse(JSON.stringify(value, (k, v) => (k === "id" ? undefined : v)));
	}

	async function reload(svc: TaskServiceImpl) {
		await svc.normalize();
		return views(svc);
	}

	it("parses the file once for a reload of the tasks and not at all for the next one", async () => {
		const { store, svc } = setup(TEXT);
		const parse = vi.spyOn(TaskDocument, "parse");
		await reload(svc);
		expect(parse).toHaveBeenCalledTimes(1);
		await reload(svc);
		expect(parse).toHaveBeenCalledTimes(1);
		expect(store.reads).toBe(8);
	});

	for (const [name, text] of [
		["\\n", TEXT],
		["\\r\\n", TEXT.replace(/\n/g, "\r\n")],
		["no last line end", TEXT.slice(0, -1)],
		["\\r\\n and no last line end", TEXT.replace(/\n/g, "\r\n").slice(0, -2)],
	] as const) {
		it(`reads its own write without parsing it again (${name})`, async () => {
			const { store, svc } = setup(text);
			const [day] = await reload(svc);
			const parse = vi.spyOn(TaskDocument, "parse");
			await svc.setStatus(day.list.find((i) => i.text === "A")!.key, "done");
			const after = parse.mock.calls.length;
			const seen = await reload(svc);
			expect(parse).toHaveBeenCalledTimes(after);
			const fresh = await reload(new TaskServiceImpl(new InMemoryTaskFileStore(store.text), new FakeSettingsStore(), clock));
			expect(withoutIds(seen)).toEqual(withoutIds(fresh));
		});
	}

	it("parses again by new settings", async () => {
		const settings = new FakeSettingsStore();
		const { svc } = setup(TEXT.replace("- [ ] C", "- [ ] C @due 2026-11-03"), settings);
		await reload(svc);
		const parse = vi.spyOn(TaskDocument, "parse");
		await settings.update({ dueDateMarker: "@due" });
		const [, soon] = await reload(svc);
		expect(parse).toHaveBeenCalledTimes(1);
		expect(soon.map((i) => i.text)).toEqual(["D 📅 2026-11-03"]);
		expect((await svc.dayView(D)).list.map((i) => i.text)).toEqual(["C"]);
	});

	it("keeps the parse over settings the file is not read by", async () => {
		const settings = new FakeSettingsStore();
		const { svc } = setup(TEXT, settings);
		await reload(svc);
		const parse = vi.spyOn(TaskDocument, "parse");
		await settings.update({ longPressMs: 400, scrollToHour: 7, staleAfterMinutes: 10 });
		await reload(svc);
		expect(parse).not.toHaveBeenCalled();
	});

	it("parses again when the day changes", async () => {
		let now = new Date(2026, 9, 30, 14, 20);
		const store = new InMemoryTaskFileStore(TEXT.replace("- [ ] C", "- [ ] C 📅 2026-10-31"));
		const svc = new TaskServiceImpl(store, new FakeSettingsStore(), { now: () => now });
		expect((await svc.dayView("2026-10-31")).list.map((i) => i.text)).toContain("C");
		expect((await svc.soonWithoutDateView()).map((i) => i.text)).toEqual([]);
		const parse = vi.spyOn(TaskDocument, "parse");
		now = new Date(2026, 10, 1, 14, 20);
		const today = await svc.dayView("2026-11-01");
		expect(parse).toHaveBeenCalledTimes(1);
		expect(today.list.map((i) => i.text)).toEqual(expect.arrayContaining(["B", "C"]));
		expect(today.list.find((i) => i.text === "C")!.dueDate).toBe("2026-11-01");
	});

	it("writes nothing on normalize when only the sections are missing, as before", async () => {
		const { store, svc } = setup("## Now\n\n- [x] Closed\n- [ ] A\n");
		await reload(svc);
		expect(store.writes).toBe(0);
		expect((await svc.dayView(T)).list.map((i) => i.text)).toEqual(["A"]);
	});

	it("parses again after an edit made elsewhere", async () => {
		const { store, svc } = setup(TEXT);
		await reload(svc);
		const parse = vi.spyOn(TaskDocument, "parse");
		store.text = TEXT.replace("- [ ] I\n", "- [ ] I\n- [ ] J\n");
		const [, , inbox] = await reload(svc);
		expect(parse).toHaveBeenCalledTimes(1);
		expect(inbox.map((i) => i.text)).toEqual(["I", "J"]);
	});
});

describe("repeat", () => {
	const WEEKLY_THU = { kind: "schedule" as const, every: 1, unit: "week" as const, days: [3 as const], dayOfMonth: null, from: null };
	const GYM = "## Inbox\n\n## Now\n\n- [ ] Gym 📅 2026-10-30 🔁 every week on Fri\n\n## Soon\n\n## Backlog\n\n## Done\n";

	function withHistory(text: string) {
		const store = new InMemoryTaskFileStore(text);
		const history = new UndoHistory(store);
		return { store, history, svc: new TaskServiceImpl(store, new FakeSettingsStore(), clock, history) };
	}

	it("setStatus done on a recurring task is one write and one undo step", async () => {
		const { store, history, svc } = withHistory(GYM);
		const view = await svc.dayView(T);
		await svc.setStatus(view.list[0].key, "done");
		expect(store.writes).toBe(1);
		expect(store.text).toContain("- [x] Gym 📅 2026-10-30");
		expect(store.text).toContain("- [ ] Gym 📅 2026-11-06 🔁 every week on Fri");
		expect(history.canUndo()).toBe(true);
		await history.undo();
		expect(store.text).toBe(GYM);
		expect(history.canUndo()).toBe(false);
	});

	it("stop closes without a copy", async () => {
		const { store, svc } = withHistory(GYM);
		const view = await svc.dayView(T);
		await svc.stop(view.list[0].key);
		expect(store.text).toContain("- [x] Gym 📅 2026-10-30");
		expect(store.text).not.toContain("🔁");
		expect(store.text!.match(/Gym/g)).toHaveLength(1);
	});

	it("setRepeat writes the field", async () => {
		const { store, svc } = setup(FULL);
		const view = await svc.dayView(T);
		await svc.setRepeat(view.list[0].key, WEEKLY_THU);
		expect(store.text).toContain("- [ ] A 📅 2026-11-05 🔁 every week on Thu");
	});

	it("setRepeat null removes it", async () => {
		const { store, svc } = withHistory(GYM);
		const view = await svc.dayView(T);
		await svc.setRepeat(view.list[0].key, null);
		expect(store.text).toContain("- [ ] Gym 📅 2026-10-30\n");
		expect(store.text).not.toContain("🔁");
	});

	it("createInPlace with a schedule gives the first day", async () => {
		const { store, svc } = setup(FULL);
		await svc.createInPlace("Run", null, { kind: "list", list: "inbox", group: null, before: null }, WEEKLY_THU);
		const view = await svc.dayView("2026-11-05");
		expect(view.list.map((i) => i.text)).toContain("Run");
		expect(store.text).toContain("- [ ] Run 📅 2026-11-05 🔁 every week on Thu");
	});

	it("create and edit take the draft's rule; undefined leaves it", async () => {
		const { store, svc } = withHistory(GYM);
		await svc.create({ text: "Run", placement: { kind: "inbox" }, priority: null, repeat: WEEKLY_THU });
		expect(store.text).toContain("Run 📅 2026-11-05 🔁 every week on Thu");
		const view = await svc.dayView(T);
		await svc.edit(view.list[0].key, { text: "Gym2", placement: { kind: "now" }, priority: null });
		expect(store.text).toContain("Gym2 📅 2026-10-30 🔁 every week on Fri");
		const again = await svc.dayView(T);
		await svc.edit(again.list[0].key, { text: "Gym2", placement: { kind: "now" }, priority: null, repeat: null });
		expect(store.text).not.toContain("Gym2 📅 2026-10-30 🔁");
	});

	it("dayView items carry the rule", async () => {
		const { svc } = setup(GYM);
		const view = await svc.dayView(T);
		expect(view.list[0].repeat).toEqual({ kind: "schedule", every: 1, unit: "week", days: [4], dayOfMonth: null, from: null });
		expect((await svc.dayView(T)).list[0].repeat).not.toBeNull();
	});
});

describe("empty sections", () => {
	const FILE = "## Inbox\n\n## Now\n\n- [ ] A\n### X\n- [ ] B\n- [ ] C\n### E\n\n## Soon\n\n- [ ] S\n\n## Backlog\n\n## Done\n";

	function withHistory(text: string) {
		const store = new InMemoryTaskFileStore(text);
		const history = new UndoHistory(store);
		return { store, history, svc: new TaskServiceImpl(store, new FakeSettingsStore(), clock, history) };
	}

	it("listSections gives each list's groups in file order, empty sections marked", async () => {
		const { svc } = setup("## Inbox\n\n### Пусто\n\n## Now\n\n- [ ] A\n### X\n- [ ] B\n### E\n### T\nnote\n\n## Soon\n\n### Y\n- [ ] S 📅 2026-11-03\n\n## Backlog\n\n## Done\n");
		expect(unkeyed(await svc.listSections())).toEqual({
			inbox: [{ name: "Пусто", empty: true }],
			backlog: [],
			now: [
				{ name: null, empty: false },
				{ name: "X", empty: false },
				{ name: "E", empty: true },
				{ name: "T", empty: true },
			],
			soon: [{ name: "Y", empty: false }],
		});
	});

	it("listSections names No section where its heading stands", async () => {
		const { svc } = setup("## Now\n\n### X\n- [ ] B\n### No section\n- [ ] A\n");
		expect(unkeyed(await svc.listSections()).now).toEqual([
			{ name: "X", empty: false },
			{ name: null, empty: false },
		]);
	});

	it("createSection is one write and one undo step, and gives the section", async () => {
		const { store, history, svc } = withHistory(FILE);
		const [, , c] = (await svc.dayView(T)).list;
		expect(await svc.createSection(" Z ", { kind: "day", date: T, group: "X", before: c.key })).toEqual({ list: "now", group: "Z" });
		expect(store.writes).toBe(1);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A\n### X\n- [ ] B\n### Z\n- [ ] C\n### E\n\n## Soon\n\n- [ ] S\n\n## Backlog\n\n## Done\n");
		await history.undo();
		expect(store.text).toBe(FILE);
		expect(history.canUndo()).toBe(false);
	});

	it("createSection at the end of a group writes an empty section in a list's column", async () => {
		const { store, svc } = setup(FILE);
		expect(await svc.createSection("Z", { kind: "list", list: "soon", group: null, before: null })).toEqual({ list: "soon", group: "Z" });
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A\n### X\n- [ ] B\n- [ ] C\n### E\n\n## Soon\n\n- [ ] S\n### Z\n\n## Backlog\n\n## Done\n");
	});

	it("createSection writes nothing for a blank name, the No section name, the group's own name or a past day", async () => {
		const { store, svc } = setup(FILE);
		const [, b] = (await svc.dayView(T)).list;
		expect(await svc.createSection("  ", { kind: "day", date: T, group: "X", before: b.key })).toBeNull();
		expect(await svc.createSection("No section", { kind: "day", date: T, group: "X", before: b.key })).toBeNull();
		expect(await svc.createSection("X", { kind: "day", date: T, group: "X", before: b.key })).toBeNull();
		expect(await svc.createSection("Z", { kind: "day", date: "2026-10-28", group: null, before: null })).toBeNull();
		expect(await svc.createSection("Z", { kind: "list", list: "now", group: null, before: null, date: "2026-10-28" })).toBeNull();
		expect(store.writes).toBe(0);
		expect(store.text).toBe(FILE);
	});

	it("createSection rejects a group the file lacks and a task not of that group, and writes nothing", async () => {
		const { store, svc } = setup(FILE);
		const [a, b] = (await svc.dayView(T)).list;
		await expect(svc.createSection("Z", { kind: "day", date: T, group: "Y", before: null })).rejects.toBeInstanceOf(StaleTaskError);
		await expect(svc.createSection("Z", { kind: "day", date: T, group: "X", before: a.key })).rejects.toBeInstanceOf(StaleTaskError);
		await expect(svc.createSection("Z", { kind: "day", date: T, group: "X", before: { ...b.key, raw: "- [ ] gone" } })).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe(FILE);
	});

	it("taking the last task out of a section takes it away, and undo brings both back", async () => {
		const text = "## Inbox\n\n## Now\n\n- [ ] A\n### X\n- [ ] B\n\n## Soon\n\n## Backlog\n\n## Done\n";
		const { store, history, svc } = withHistory(text);
		const [, b] = (await svc.dayView(T)).list;
		await svc.moveToGroup(b.key, "now", null, null);
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] A\n- [ ] B 📅 2026-10-30\n\n## Soon\n\n## Backlog\n\n## Done\n");
		expect(unkeyed(await svc.listSections()).now).toEqual([{ name: null, empty: false }]);
		await history.undo();
		expect(store.text).toBe(text);
	});

	it("a task dropped into an empty section fills it", async () => {
		const { store, svc } = setup(FILE);
		const [a] = (await svc.dayView(T)).list;
		await svc.moveToGroup(a.key, "now", "E", null);
		expect(store.text).toContain("### E\n- [ ] A 📅 2026-10-30\n");
		expect(unkeyed(await svc.listSections()).now).toEqual([
			{ name: "X", empty: false },
			{ name: "E", empty: false },
		]);
	});
});

describe("search", () => {
	/** The hits of every group, in the groups' order. */
	const found = async (svc: { search(query: string): Promise<readonly SearchGroup[]> }, query: string) => (await svc.search(query)).flatMap((group) => group.hits);

	const FILE = [
		"## Inbox", "", "- [ ] Фото на паспорт", "",
		"## Backlog", "", "- [ ] Разобрать шкаф", "",
		"## Soon", "", "- [ ] Записаться в МФЦ", "\t- взять старый паспорт и фото", "- [ ] Поездка в Казань", "\t- [ ] Найти паспорт", "\t- [x] Купить паспорт-обложку", "",
		"## Now", "", "- [ ] Забрать паспорт 📅 2026-11-12", "\t- про паспорт ещё раз", "- [ ] Читать [[Заметка|ёлочный паспорт]]", "",
		"## Done", "", "- [x] Оплатить госпошлину за паспорт", "",
	].join("\n");

	it("gives the finds in a group per list, Inbox, Backlog, Soon, Now, Done, none for a list with nothing found", async () => {
		const { svc } = setup(FILE);
		const groups = await svc.search("паспорт");
		expect(groups.map((g) => g.list)).toEqual(["inbox", "soon", "now", "done"]);
		expect(groups.every((g) => g.hits.every((h) => h.item.list === g.list))).toBe(true);
		expect((await svc.search("шкаф")).map((g) => g.list)).toEqual(["backlog"]);
	});

	it("finds titles and descriptions section by section, open subtasks too", async () => {
		const { svc } = setup(FILE);
		const hits = await found(svc, "ПАСПОРТ");
		expect(hits.map((h) => h.item.list)).toEqual(["inbox", "soon", "soon", "now", "now", "done"]);
		expect(hits.map((h) => h.item.text.split(" ")[0])).toEqual(["Фото", "Найти", "Записаться", "Забрать", "Читать", "Оплатить"]);
	});

	it("a found subtask is its own hit; a closed one is not found", async () => {
		const { svc } = setup(FILE);
		const hits = await found(svc, "паспорт");
		const sub = hits.find((h) => h.item.isSubtask);
		expect(sub?.title).toEqual([{ text: "Найти ", match: false }, { text: "паспорт", match: true }]);
		expect(hits.some((h) => h.item.text.includes("обложку"))).toBe(false);
	});

	it("a match only in the description leaves the title empty and gives the line around it", async () => {
		const { svc } = setup(FILE);
		const hit = (await found(svc, "паспорт")).find((h) => h.item.text === "Записаться в МФЦ")!;
		expect(hit.title).toEqual([]);
		expect(hit.description).toEqual([
			{ text: "взять старый ", match: false },
			{ text: "паспорт", match: true },
			{ text: " и фото", match: false },
		]);
	});

	it("a match in both gives both", async () => {
		const { svc } = setup(FILE);
		const hit = (await found(svc, "паспорт")).find((h) => h.item.list === "now")!;
		expect(hit.title.some((p) => p.match)).toBe(true);
		expect(hit.description?.find((p) => p.match)?.text).toBe("паспорт");
	});

	it("reads a link by what it shows and «ё» as «е»", async () => {
		const { svc } = setup(FILE);
		const hits = await found(svc, "елочный");
		expect(hits.map((h) => h.title)).toEqual([[{ text: "Читать ", match: false }, { text: "ёлочный", match: true }, { text: " паспорт", match: false }]]);
		expect(await found(svc, "Заметка")).toEqual([]);
	});

	it("finds the query's words in their order, each a part of a word, and the best match first", async () => {
		const { svc } = setup(["## Inbox", "", "- [ ] Отвезти шкаф Элеоноре", "- [ ] Ответить Элине", "- [ ] Разобрать почту", ""].join("\n"));
		const hits = await found(svc, "отв эл");
		expect(hits.map((h) => h.item.text)).toEqual(["Ответить Элине", "Отвезти шкаф Элеоноре"]);
		expect(hits[0].title).toEqual([
			{ text: "Отв", match: true },
			{ text: "етить ", match: false },
			{ text: "Эл", match: true },
			{ text: "ине", match: false },
		]);
	});

	it("a match in the title stands before one only in the description", async () => {
		const { svc } = setup(["## Inbox", "", "- [ ] Позвонить", "\t- про паспорт", "- [ ] Сделать паспорт", ""].join("\n"));
		expect((await found(svc, "паспорт")).map((h) => h.item.text)).toEqual(["Сделать паспорт", "Позвонить"]);
	});

	it("reads a description by its words, not its Markdown", async () => {
		const { svc } = setup(["## Inbox", "", "- [ ] Позвонить", "\t- **важно** сегодня", "\t- [[Заметка|план]]", ""].join("\n"));
		const [hit] = await found(svc, "важно сегодня план");
		expect(hit.description?.map((p) => p.text).join("")).toBe("важно сегодня план");
		expect(await found(svc, "Заметка")).toEqual([]);
	});

	it("a query of spaces finds nothing", async () => {
		const { svc } = setup(FILE);
		expect(await found(svc, "   ")).toEqual([]);
	});

	it("doneView lists Done in file order", async () => {
		const { svc } = setup(FILE);
		expect((await svc.doneView()).map((i) => i.text)).toEqual(["Оплатить госпошлину за паспорт"]);
	});
});

describe("TaskServiceImpl.screen", () => {
	const FILE = "## Inbox\n\n- [ ] I\n\n## Now\n\n- [x] Finished\n- [ ] A\n\n## Soon\n\n- [ ] S\n- [ ] Later 📅 2026-11-03\n\n## Backlog\n\n- [ ] B\n\n## Done\n";

	it("normalizes the file first, then reads what the screen shows as each read alone does", async () => {
		const { store, svc } = setup(FILE);
		const screen = await svc.screen(D);
		expect(store.writes).toBe(1);
		expect(screen).toEqual({
			day: await svc.dayView(D),
			soon: await svc.soonWithoutDateView(),
			inbox: await svc.inboxView(),
			backlog: await svc.backlogView(),
			done: await svc.doneView(),
			sections: await svc.listSections(),
			offer: await svc.sectionOffer(D),
			missing: false,
			calendars: true,
			projects: screen.projects,
			project: null,
			titleDrops: screen.titleDrops,
		});
		expect(screen.projects.backlog).toMatchObject({ canGroup: true, on: true });
		expect(screen.projects.soon).toEqual({ canGroup: true, on: false, groups: [] });
		expect(screen.done.map((t) => t.text)).toEqual(["Finished"]);
		expect(screen.day.list.map((t) => t.text)).toEqual(["Later"]);
	});

	it("reads the file once for the normalization and once for every list: the lists agree with each other", async () => {
		const { store, svc } = setup(FILE);
		const read = vi.spyOn(store, "read");
		await svc.screen(T);
		expect(read).toHaveBeenCalledTimes(2);
	});

	it("without a file is the empty screen that says so, with no calendars beside it", async () => {
		const { svc } = setup(null);
		const screen = await svc.screen(T);
		expect(screen.missing).toBe(true);
		expect(screen.calendars).toBe(false);
		expect(screen.day).toEqual({ date: T, list: [], slotted: [] });
		expect([...screen.soon, ...screen.inbox, ...screen.backlog, ...screen.done]).toEqual([]);
		expect(Object.values(screen.sections).flat()).toEqual([]);
		await expect(svc.dayView(T)).rejects.toBeInstanceOf(TasksFileMissingError);
	});
});

describe("labels", () => {
	const labelled = () => new FakeSettingsStore({ ...DEFAULT_SETTINGS, labels: [{ name: "Важное", color: "red" }, { name: "Срочное", color: "orange" }] });

	it("writes several tasks' labels at once and gives each task back as it then stands, its key fresh", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A\n- [ ] p1 B\n- [ ] C #label/Важное\n", labelled());
		const now = (await svc.dayView(T)).list;
		const items = await svc.setLabelsAll([
			{ key: now[0].key, labels: ["Срочное"] },
			{ key: now[1].key, labels: ["Срочное"] },
			{ key: now[2].key, labels: ["Важное", "Срочное"] },
		]);
		expect(await store.read()).toContain("- [ ] A #label/Срочное\n- [ ] p1 B\n- [ ] C #label/Важное #label/Срочное");
		expect(items.map((item) => [item?.text, item?.labels.map((l) => l.name), item?.key.raw])).toEqual([
			["A", ["Срочное"], "- [ ] A #label/Срочное"],
			["B", [], "- [ ] p1 B"],
			["C", ["Важное", "Срочное"], "- [ ] C #label/Важное #label/Срочное"],
		]);
		const again = await svc.setLabels(items[0]!.key, []);
		expect(again?.labels).toEqual([]);
	});

	it("tells what each task may be given: a priority while it has no labels, labels while it has no priority", async () => {
		const { svc } = setup("## Now\n\n- [ ] A\n- [ ] p1 B\n- [ ] C #label/Важное\n- [ ] p1 D #label/Важное\n", labelled());
		const can = (await svc.dayView(T)).list.map((item) => [item.can.setPriority, item.can.setLabels]);
		expect(can).toEqual([[true, true], [true, false], [false, true], [true, false]]);
	});

	it("answers for the bar with the marks the file then has: the priority chosen or typed, else the labels", async () => {
		const NOW = { kind: "list", list: "now", group: null, before: null } as const;
		const drafts: [string, string | null, string[]][] = [["p1 Buy milk", null, ["Важное"]], ["Buy milk", null, ["Важное", "Срочное"]], ["Buy milk", "p2", ["Срочное"]], ["p2 Buy milk", "p1", []], ["Buy milk", null, []], ["  p1 Buy milk", null, []], ["\tp1 Buy milk", null, ["Важное"]]];
		for (const [text, priority, labels] of drafts) {
			const { svc } = setup("## Inbox\n\n## Now\n\n## Soon\n\n## Backlog\n\n## Done\n", labelled());
			const shown = svc.draftMarks(text, priority, labels);
			await svc.createInPlace(text, priority, NOW, null, labels);
			const written = (await svc.dayView(T)).list[0];
			expect({ priority: shown.priority, labels: shown.labels }, text).toEqual({ priority: written.priority, labels: written.labels });
			expect(shown.can, text).toEqual({ setPriority: written.can.setPriority, setLabels: written.can.setLabels });
			expect(shown.tint, text).toBe(written.colors[0] ?? null);
		}
		expect(setup("## Now\n", labelled()).svc.draftMarks("p1 Buy milk", null, ["Важное"])).toMatchObject({ priority: { prefix: "p1", color: "red" }, labels: [], can: { setPriority: true, setLabels: false }, tint: "red" });
	});

	it("offers every level and label as a tile: on when the task is written with it, enabled while it may be chosen", () => {
		const { svc } = setup("## Now\n", labelled());
		const labelledDraft = svc.draftMarks("Buy milk", null, ["Срочное"]);
		expect(labelledDraft.tint).toBe("orange");
		expect(labelledDraft.tiles.labels.map((t) => [t.mark.name, t.on, t.enabled])).toEqual([["Важное", false, true], ["Срочное", true, true]]);
		expect(labelledDraft.tiles.levels.every((t) => !t.on && !t.enabled)).toBe(true);
		const prioritized = svc.draftMarks("p2 Buy milk", null, []);
		expect(prioritized.tiles.levels.filter((t) => t.on).map((t) => t.mark.prefix)).toEqual(["p2"]);
		expect(prioritized.tiles.labels.every((t) => !t.on && !t.enabled)).toBe(true);
		expect(svc.draftMarks("Buy milk", null, []).tint).toBeNull();
	});
});

describe("the timeline's cards", () => {
	/** A card 40 px tall with its 2 px of gap at 56 px an hour. */
	const CARD_MIN = (42 / 56) * 60;
	const LATE = "## Inbox\n\n## Now\n\n- [ ] A 📌 2026-10-30 10:00-11:00\n- [ ] B 📌 2026-10-30 16:00\n- [x] C 📌 2026-10-30 09:00\n\n## Soon\n\n## Backlog\n\n## Done\n";

	/** The day starts at 5:00 by default: 14:20 is minute 560 of it, 10:00 minute 300. */
	it("shows an open task past its start on the now line, its duration kept, and a closed one on its time", async () => {
		const { svc } = setup(LATE);
		const [late, later] = (await svc.dayView(T)).slotted;
		expect(svc.shownSpan(late, T)).toEqual({ start: 560, end: 620 });
		expect(svc.shownSpan(later, T)).toEqual({ start: 660, end: null });
		expect(svc.shownSpan({ ...late, open: false }, T)).toEqual({ start: 300, end: 360 });
		expect(svc.shownSpan(late, "2026-10-29")).toEqual({ start: 1740, end: 1800 });
	});

	it("stretches a card from where it is shown", async () => {
		const { svc } = setup(LATE);
		const [late, later] = (await svc.dayView(T)).slotted;
		expect(svc.stretch(late, T, "end", 1000)).toEqual({ start: 560, end: 1000 });
		expect(svc.stretch(later, T, "start", 600)).toEqual({ start: 600, end: 660 });
	});

	it("resizes a task: the bottom dot writes the end, the top dot the start", async () => {
		const { store, svc } = setup(LATE);
		const later = (await svc.dayView(T)).slotted[1];
		expect(await svc.resize(later.key, T, "end", 750, CARD_MIN)).toBe(true);
		expect(store.text).toContain("- [ ] B 📌 2026-10-30 16:00-17:30\n");
		const stretched = (await svc.dayView(T)).slotted[1];
		expect(await svc.resize(stretched.key, T, "start", 630, CARD_MIN)).toBe(true);
		expect(store.text).toContain("- [ ] B 📌 2026-10-30 15:30-17:30\n");
	});

	it("keeps an overdue task's own start when its bottom dot stretches it on the now line", async () => {
		const { store, svc } = setup(LATE);
		const late = (await svc.dayView(T)).slotted[0];
		expect(await svc.resize(late.key, T, "end", 710, CARD_MIN)).toBe(true);
		expect(store.text).toContain("- [ ] A 📌 2026-10-30 10:00-12:30\n");
	});

	it("writes an overdue task's top dot as its new start", async () => {
		const { store, svc } = setup(LATE);
		const late = (await svc.dayView(T)).slotted[0];
		expect(await svc.resize(late.key, T, "start", 540, CARD_MIN)).toBe(true);
		expect(store.text).toContain("- [ ] A 📌 2026-10-30 14:00-15:20\n");
	});

	it("takes the duration away from a span no taller than a card", async () => {
		const { store, svc } = setup(LATE);
		const late = (await svc.dayView(T)).slotted[0];
		expect(await svc.resize(late.key, T, "end", 590, CARD_MIN)).toBe(true);
		expect(store.text).toContain("- [ ] A 📌 2026-10-30 10:00\n");
	});

	it("writes nothing when the card lets go as it was shown", async () => {
		const { store, svc } = setup(LATE);
		const [late, later] = (await svc.dayView(T)).slotted;
		expect(await svc.resize(late.key, T, "end", 620, CARD_MIN)).toBe(false);
		expect(await svc.resize(later.key, T, "start", 690, CARD_MIN)).toBe(false);
		expect(store.writes).toBe(0);
	});

	it("rejects a key whose line changed", async () => {
		const { store, svc } = setup(LATE);
		const late = (await svc.dayView(T)).slotted[0];
		store.text = store.text!.replace("- [ ] A", "- [ ] A2");
		await expect(svc.resize(late.key, T, "end", 710, CARD_MIN)).rejects.toBeInstanceOf(StaleTaskError);
	});

	it("gives a slotted task's duration, none without one", async () => {
		const { svc } = setup(LATE);
		const [late, later] = (await svc.dayView(T)).slotted;
		expect(late.durationMin).toBe(60);
		expect(later.durationMin).toBeNull();
	});
});

describe("the full screen's task", () => {
	const TRIP = "## Inbox\n\n## Now\n\n- [ ] Trip\n\t- [ ] Pack\n\t\t- [x] Laptop\n\t\t- [ ] Pass\n\t- [-] Wash\n\n## Soon\n\n## Backlog\n\n## Done\n";

	it("names the task a subtask belongs to by its key, its line as read", async () => {
		const { svc } = setup(TRIP);
		const [trip] = (await svc.dayView(T)).list;
		const pack = trip.allSubtasks[0];
		expect(trip.parentKey).toBeNull();
		expect(pack.parentKey).toEqual(trip.key);
		expect(pack.allSubtasks[0].parentKey).toEqual(pack.key);
		expect((await svc.find(pack.parentKey!, pack.parentText!))?.text).toBe("Trip");
		expect((await svc.find(pack.key, pack.text))?.parentKey).toEqual(trip.key);
	});

	it("toggleDone ticks an open subtask done and opens a done or given-up one again, by its status in the file", async () => {
		const { store, svc } = setup(TRIP);
		const [trip] = (await svc.dayView(T)).list;
		const [pack, wash] = trip.allSubtasks;
		await svc.toggleDone(pack.allSubtasks[0].key);
		await svc.toggleDone(wash.key);
		await svc.toggleDone(pack.allSubtasks[1].key);
		expect(store.text).toContain("\t- [ ] Pack\n\t\t- [ ] Laptop\n\t\t- [x] Pass\n\t- [ ] Wash\n");
	});

	it("rename takes the text as typed and answers with the task as it now stands; a blank or the same title writes nothing", async () => {
		const { store, svc } = setup(TRIP);
		const pack = (await svc.dayView(T)).list[0].allSubtasks[0];
		expect(await svc.rename(pack.key, "  Pack  ")).toBeNull();
		expect(await svc.rename(pack.key, "   ")).toBeNull();
		expect(store.writes).toBe(0);
		const renamed = await svc.rename(pack.key, " p1 Pack the bag ");
		expect(renamed).toMatchObject({ text: "Pack the bag", priority: { prefix: "p1" }, parentText: "Trip" });
		expect(store.text).toContain("\t- [ ] p1 Pack the bag\n");
		expect(renamed?.key.raw).toBe("\t- [ ] p1 Pack the bag");
	});
});

describe("where a task shows, and a task by its key", () => {
	const FILE = [
		"## Inbox", "", "- [ ] I", "",
		"## Backlog", "", "- [ ] B", "",
		"## Soon", "", "- [ ] S", "- [ ] Later 📅 2026-11-03", "\t- [ ] Sub", "- [ ] Slotted ⏰ 2026-11-05 10:00", "",
		"## Now", "", "- [ ] N", "",
		"## Done", "", "- [x] X", "",
	].join("\n");

	it("Done, Inbox and Backlog in their lists; a task of Now on today, of Soon on its day, Soon without one", async () => {
		const { svc } = setup(FILE);
		const all = [...(await svc.inboxView()), ...(await svc.backlogView()), ...(await svc.doneView()), ...(await svc.soonWithoutDateView()), ...(await svc.dayView(T)).list, ...(await svc.dayView(D)).list, ...(await svc.dayView("2026-11-05")).slotted];
		const at = (text: string) => svc.screenOf(all.find((i) => i.text === text)!);
		expect(await at("I")).toEqual({ kind: "list", list: "inbox" });
		expect(await at("B")).toEqual({ kind: "list", list: "backlog" });
		expect(await at("X")).toEqual({ kind: "list", list: "done" });
		expect(await at("S")).toEqual({ kind: "list", list: "soon" });
		expect(await at("N")).toEqual({ kind: "day", date: T });
		expect(await at("Later")).toEqual({ kind: "day", date: D });
		expect(await at("Slotted")).toEqual({ kind: "day", date: "2026-11-05" });
	});

	it("a found subtask shows where its task stands, not by its own dates", async () => {
		const { svc } = setup(FILE.replace("- [ ] S", "- [ ] S\n\t- [ ] Own 📅 2026-11-09"));
		const [later] = (await svc.dayView(D)).list;
		expect(await svc.screenOf(later.subtasks[0])).toEqual({ kind: "day", date: D });
		const [soon] = await svc.soonWithoutDateView();
		expect(await svc.screenOf(soon.subtasks[0])).toEqual({ kind: "list", list: "soon" });
	});

	it("reveal: a found subtask's tasks show their subtasks, and the screen is its task's", async () => {
		const { store, svc } = setup(FILE.replace("- [ ] Later 📅 2026-11-03\n\t- [ ] Sub", "- [ ] Later 📅 2026-11-03 📁\n\t- [ ] Sub"));
		const [later] = (await svc.dayView(D)).list;
		expect(later.collapsed).toBe(true);
		expect(await svc.reveal(later.subtasks[0])).toEqual({ kind: "day", date: D });
		expect(store.text).toContain("- [ ] Later 📅 2026-11-03\n\t- [ ] Sub");
	});

	it("reveal: a task writes nothing and answers where it shows", async () => {
		const { store, svc } = setup(FILE);
		const before = store.text;
		const [inbox] = await svc.inboxView();
		expect(await svc.reveal(inbox)).toEqual({ kind: "list", list: "inbox" });
		expect(store.text).toBe(before);
	});

	it("finds a task among items and their subtasks by its key, none for a key not there", async () => {
		const { svc } = setup(FILE);
		const items = (await svc.dayView(D)).list;
		const sub = items[0].subtasks[0];
		expect(svc.findIn(items, sub.key)?.text).toBe("Sub");
		expect(svc.findIn(items, items[0].key)?.text).toBe("Later");
		expect(svc.findIn(items, { ...sub.key, index: 9 })).toBeNull();
	});
});
