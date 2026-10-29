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
		await expect(svc.soonView()).rejects.toBeInstanceOf(TasksFileMissingError);
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

	it("soonView lists Soon tasks without fields", async () => {
		const { svc } = setup("## Now\n- [ ] A\n\n## Soon\n- [ ] C\n- [ ] D 📅 2026-11-03\n- [ ] E ⏰ 2026-11-03 10:00-11:00\n");
		expect((await svc.soonView()).map((i) => i.text)).toEqual(["C"]);
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
		const { store, svc } = setup("## Now\n- [ ] A\n- [ ] B\n\n## Soon\n\n## Done\n");
		const view = await svc.dayView(T);
		await svc.setStatus(view.list[0].key, "done");
		expect(store.writes).toBe(1);
		expect(store.text).toBe("## Now\n- [ ] B\n\n## Soon\n\n## Done\n- [x] A\n");
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
		expect(view.list[0].key).toEqual({ section: "now", index: 0, raw: "- [ ] A" });
		await svc.rename(view.list[0].key, "A2");
		expect(store.text).toBe("## Now\n- [ ] A2\n\n## Done\n- [x] Old\n\n## Soon\n");
	});

	it("adds the missing Now, Soon and Done on first write", async () => {
		const { store, svc } = setup("## Now\n");
		await svc.createInList(T, "A");
		expect(store.text).toBe("## Now\n- [ ] A\n\n## Soon\n\n## Done\n");
		await svc.createInSoon("S");
		expect(store.text).toBe("## Now\n- [ ] A\n\n## Soon\n- [ ] S\n\n## Done\n");
	});

	it("uses the section names and markers from settings", async () => {
		const settings = new FakeSettingsStore({
			...DEFAULT_SETTINGS,
			sections: { inbox: "In", now: "Today", soon: "Next", backlog: "Later", done: "Finished" },
			dueDateMarker: "due:",
			slotMarker: "at:",
		});
		const { store, svc } = setup("## Today\n\n## Next\n\n## Finished\n", settings);
		await svc.createInList(D, "A");
		expect(store.text).toBe("## Today\n\n## Next\n- [ ] A due: 2026-11-03\n\n## Finished\n");
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

	it("createAtTime takes the duration from settings", async () => {
		const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, newTaskMinutes: 45 });
		const { store, svc } = setup(FULL, settings);
		await svc.createAtTime(T, 600, "Call");
		expect(store.text).toContain("## Now\n- [ ] A\n- [ ] B\n- [ ] Call ⏰ 2026-10-30 10:00-10:45\n");
		await svc.createAtTime(D, 1420, "Late");
		expect(store.text).toContain("## Soon\n- [ ] C\n- [ ] Late ⏰ 2026-11-03 23:40-24:00\n");
	});

	it("normalizes after every write", async () => {
		const { store, svc } = setup("## Now\n- [ ] A\n\n## Soon\n- [ ] S\n\n## Done\n");
		const soon = await svc.soonView();
		await svc.setDueDate(soon[0].key, T);
		expect(store.text).toBe("## Now\n- [ ] S 📅 2026-10-30\n- [ ] A\n\n## Soon\n\n## Done\n");
	});

	it("moves tasks between the list, Soon and the timeline", async () => {
		const { store, svc } = setup(FULL);
		let view = await svc.dayView(T);
		await svc.setSlot(view.list[0].key, { date: T, start: 600, end: 660 });
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n- [ ] B\n\n## Soon\n- [ ] C\n\n## Backlog\n\n## Done\n");
		view = await svc.dayView(T);
		await svc.clearSlot(view.slotted[0].key);
		expect(store.text).toBe(FULL);
		const soon = await svc.soonView();
		await svc.moveToList(soon[0].key, T);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A\n- [ ] B\n- [ ] C\n\n## Soon\n\n## Backlog\n\n## Done\n");
		view = await svc.dayView(T);
		await svc.moveToSoon(view.list[0].key, T);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] B\n- [ ] C\n\n## Soon\n- [ ] A\n\n## Backlog\n\n## Done\n");
		view = await svc.dayView(T);
		await svc.moveBefore(view.list[1].key, view.list[0].key, T);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] C\n- [ ] B\n\n## Soon\n- [ ] A\n\n## Backlog\n\n## Done\n");
		view = await svc.dayView(T);
		await svc.remove(view.list[0].key);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] B\n\n## Soon\n- [ ] A\n\n## Backlog\n\n## Done\n");
	});

	it("normalize writes only when a rule changed something", async () => {
		const { store, svc } = setup("## Now\n- [ ] A\n\n## Soon\n\n## Done\n");
		await svc.normalize();
		expect(store.writes).toBe(0);
		store.text = "## Now\n- [x] A\n\n## Soon\n\n## Done\n";
		await svc.normalize();
		expect(store.writes).toBe(1);
		expect(store.text).toBe("## Now\n\n## Soon\n\n## Done\n- [x] A\n");
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
		await svc.create({ text: "S", placement: { kind: "soon" } });
		await svc.create({ text: "N", placement: { kind: "now" } });
		await svc.create({ text: "D", placement: { kind: "date", date: D } }, { date: D, start: 600, end: 660 });
		await svc.create({ text: "P", placement: { kind: "date", date: "2026-10-01" } });
		expect(store.writes).toBe(4);
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A\n- [ ] B\n- [ ] N\n- [ ] P 📅 2026-10-01\n\n## Soon\n- [ ] C\n- [ ] S\n- [ ] D 📅 2026-11-03 ⏰ 2026-11-03 10:00-11:00\n\n## Backlog\n\n## Done\n");
	});

	it("create with blank text writes nothing", async () => {
		const { store, svc } = setup(FULL);
		await svc.create({ text: " ", placement: { kind: "now" } });
		expect(store.writes).toBe(0);
	});

	it("edit with the same placement only renames in place", async () => {
		const { store, svc } = setup(FULL);
		const view = await svc.dayView(T);
		await svc.edit(view.list[0].key, { text: "A2", placement: { kind: "now" } });
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] A2\n- [ ] B\n\n## Soon\n- [ ] C\n\n## Backlog\n\n## Done\n");
	});

	it("edit with another placement moves the task", async () => {
		const { store, svc } = setup(FULL);
		const view = await svc.dayView(T);
		await svc.edit(view.list[0].key, { text: "A", placement: { kind: "soon" } });
		expect(store.text).toBe("## Inbox\n\n## Now\n- [ ] B\n\n## Soon\n- [ ] C\n- [ ] A\n\n## Backlog\n\n## Done\n");
	});

	it("edit with blank text writes nothing and a stale key is rejected", async () => {
		const { store, svc } = setup(FULL);
		const view = await svc.dayView(T);
		await svc.edit(view.list[0].key, { text: "", placement: { kind: "soon" } });
		expect(store.writes).toBe(0);
		store.text = "## Now\n- [ ] Changed\n";
		await expect(svc.edit(view.list[0].key, { text: "X", placement: { kind: "soon" } })).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe("## Now\n- [ ] Changed\n");
	});

	it("placementOf returns date when the task has a due date, else the section", async () => {
		const { svc } = setup("## Now\n- [ ] A 📅 2026-11-03\n- [ ] B\n\n## Soon\n- [ ] S\n");
		const view = await svc.dayView(T);
		expect(svc.placementOf(view.list[0])).toEqual({ kind: "date", date: D });
		expect(svc.placementOf(view.list[1])).toEqual({ kind: "now" });
		expect(svc.placementOf((await svc.soonView())[0])).toEqual({ kind: "soon" });
	});
});

describe("onChange", () => {
	it("fires on a hand edit and after own writes", async () => {
		const { store, svc } = setup(FULL);
		let fired = 0;
		const off = svc.onChange(() => fired++);
		store.emitModify();
		expect(fired).toBe(1);
		await svc.createInSoon("X");
		expect(fired).toBe(2);
		await svc.createInSoon("  ");
		expect(fired).toBe(2);
		off();
		store.emitModify();
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
