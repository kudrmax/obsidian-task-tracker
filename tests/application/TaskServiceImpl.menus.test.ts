import { describe, expect, it } from "vitest";
import { StaleTaskError } from "../../core/application/contracts";
import type { Clock } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-10-30";
const clock: Clock = { now: () => new Date(2026, 9, 30, 14, 20) };
const labelled = () => new FakeSettingsStore({ ...DEFAULT_SETTINGS, labels: [{ name: "Важное", color: "red" }, { name: "Срочное", color: "orange" }] });

function setup(text: string) {
	const store = new InMemoryTaskFileStore(text);
	return { store, svc: new TaskServiceImpl(store, labelled(), clock) };
}

describe("what a task may be given in its menu", () => {
	it("Stop for a task that repeats and may, Add description for one without any, folding for one with an open subtask", async () => {
		const { svc } = setup("## Now\n\n- [ ] A 🔁 every day\n- [ ] B\n  - [ ] B1\n- [ ] C\n  - [x] C1\n  note\n");
		const [a, b, c] = (await svc.dayView(T)).list;
		expect([a, b, c].map((item) => [item.can.stop, item.can.addDescription, item.can.fold])).toEqual([
			[true, true, false],
			[false, true, true],
			[false, false, false],
		]);
		const { svc: done } = setup("## Done\n\n- [x] D 🔁 every day\n");
		expect((await done.doneView())[0].can.stop).toBe(false);
	});
});

describe("a tap on a level", () => {
	it("sets it on one task, and on the task's own level takes it off", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A\n");
		let [a] = (await svc.dayView(T)).list;
		await svc.togglePriority([a.key], "p1");
		expect(store.text).toContain("- [ ] p1 A");
		[a] = (await svc.dayView(T)).list;
		await svc.togglePriority([a.key], "p1");
		expect(store.text).toContain("- [ ] A");
		expect(store.text).not.toContain("p1");
	});

	it("on several tasks: off them all when they all have it, the tasks with labels aside; else on them all; one write", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] p1 A\n- [ ] B #label/Важное\n- [ ] C\n");
		let now = (await svc.dayView(T)).list;
		const writes = store.writes;
		await svc.togglePriority(now.map((i) => i.key), "p1");
		expect(store.writes).toBe(writes + 1);
		expect(store.text).toContain("- [ ] p1 A\n- [ ] B #label/Важное\n- [ ] p1 C");
		now = (await svc.dayView(T)).list;
		await svc.togglePriority(now.map((i) => i.key), "p1");
		expect(store.text).toContain("- [ ] A\n- [ ] B #label/Важное\n- [ ] C");
	});

	it("rejects with StaleTaskError, writing nothing, when a task is gone", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A\n");
		await expect(svc.togglePriority([{ section: "now", index: 0, path: [], raw: "- [ ] X" }], "p1")).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.writes).toBe(0);
	});
});

describe("a tap on a label", () => {
	it("puts it last on one task, takes it off again, and answers with the task as it then stands", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A #label/Срочное\n");
		const [a] = (await svc.dayView(T)).list;
		const [on] = await svc.toggleLabel([a.key], "Важное");
		expect(store.text).toContain("- [ ] A #label/Срочное #label/Важное");
		expect(on?.key.raw).toBe("- [ ] A #label/Срочное #label/Важное");
		const [off] = await svc.toggleLabel([on!.key], "Важное");
		expect(off?.labels.map((l) => l.name)).toEqual(["Срочное"]);
	});

	it("on several: on each without it, the tasks with a priority aside; off them all once they all have it", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A #label/Важное\n- [ ] B\n- [ ] p1 C\n");
		const now = (await svc.dayView(T)).list;
		const items = await svc.toggleLabel(now.map((i) => i.key), "Важное");
		expect(store.text).toContain("- [ ] A #label/Важное\n- [ ] B #label/Важное\n- [ ] p1 C");
		await svc.toggleLabel(items.map((i) => i!.key), "Важное");
		expect(store.text).toContain("- [ ] A\n- [ ] B\n- [ ] p1 C");
	});
});

describe("Remove due date", () => {
	it("takes the date off the tasks that can lose it and leaves today's, in one write", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A 📅 2026-10-30\n\n## Soon\n\n- [ ] B 📅 2026-11-03\n- [ ] C 📅 2026-11-04\n");
		const day = (await svc.dayView(T)).list;
		const later = (await svc.dayView("2026-11-03")).list.concat((await svc.dayView("2026-11-04")).list).filter((i) => i.list === "soon");
		const writes = store.writes;
		await svc.removeDue([day[0].key, ...later.map((i) => i.key)]);
		expect(store.writes).toBe(writes + 1);
		expect(store.text).toContain("- [ ] A 📅 2026-10-30");
		expect(store.text).toContain("- [ ] B\n- [ ] C\n");
	});

	it("writes nothing when no task can lose its date", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A 📅 2026-10-30\n");
		const [a] = (await svc.dayView(T)).list;
		const writes = store.writes;
		await svc.removeDue([a.key]);
		expect(store.writes).toBe(writes);
	});
});

describe("the menu's model", () => {
	const screenOf = async (svc: TaskServiceImpl, day = T) => ({ today: T, day, offer: await svc.sectionOffer(day) });

	it("reads the levels and labels of the settings", async () => {
		const { svc } = setup("## Now\n\n- [ ] p1 A\n");
		const menu = svc.menu((await svc.dayView(T)).list[0], "day", await screenOf(svc));
		expect(menu.levels.tiles.map((t) => [t.level.prefix, t.on])).toEqual(DEFAULT_SETTINGS.priorities.map((l) => [l.prefix, l.prefix === "p1"]));
		expect(menu.labels).toEqual({ tiles: [{ label: { name: "Важное", color: "red" }, on: false }, { label: { name: "Срочное", color: "orange" }, on: false }], disabled: true });
		expect(menu.moves.map((m) => m.id)).toEqual(["tomorrow", "pick"]);
	});

	it("offers a list card the sections of its list where its column shows them, a timeline card none", async () => {
		const { svc } = setup("## Now\n\n### Work\n- [ ] A\n\n## Soon\n\n- [ ] S 📅 2026-10-31\n");
		const [a] = (await svc.dayView(T)).list;
		const screen = await screenOf(svc);
		expect(svc.menu(a, "day", screen).sections?.choice.current).toBe("Work");
		expect(svc.menu(a, "timeline", screen).sections).toBeNull();
		expect(svc.menu(a, "full", screen).sections).toBeNull();
		expect(svc.menu(a, "day", screen).edits).toContain("section");
	});

	it("offers no sections in the column of a past day, which shows none", async () => {
		const { svc } = setup("## Now\n\n### Work\n- [ ] A\n");
		const [a] = (await svc.dayView(T)).list;
		expect(svc.menu(a, "day", await screenOf(svc, "2026-10-29")).sections).toBeNull();
	});

	it("offers the picked tasks sections only when every card stands where its list's show", async () => {
		const { svc } = setup("## Now\n\n### Work\n- [ ] A\n- [ ] B\n");
		const [a, b] = (await svc.dayView(T)).list;
		const screen = await screenOf(svc);
		expect(svc.bulkMenu([{ item: a, from: "day" }, { item: b, from: "day" }], screen).sections?.options[0]).toEqual({ name: "Work", checked: true });
		expect(svc.bulkMenu([{ item: a, from: "day" }, { item: b, from: "day" }], screen).edits).toEqual(["section", "project"]);
		expect(svc.bulkMenu([{ item: a, from: "day" }, { item: b, from: "timeline" }], screen).sections).toBeNull();
	});
});

describe("a menu's status tiles", () => {
	it("write one task's status, Won't do giving it up and Stop stopping it", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A\n- [ ] B 🔁 every day\n");
		const [a] = (await svc.dayView(T)).list;
		await svc.pickStatus([a.key], "wontDo");
		expect(store.text).toContain("- [-] A");
		const [b] = (await svc.dayView(T)).list;
		await svc.pickStatus([b.key], "stop");
		expect(store.text).not.toContain("🔁");
		expect(store.text).toContain("- [x] B");
	});

	it("write every picked task's in one write", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A\n- [/] B\n");
		const [a, b] = (await svc.dayView(T)).list;
		const writes = store.writes;
		await svc.pickStatus([a.key, b.key], "stopProgress");
		expect(store.writes).toBe(writes + 1);
		expect(store.text).toContain("- [ ] A\n- [ ] B");
	});
});

describe("a bulk menu's moves and Delete", () => {
	it("put off only the tasks that may be, in one write", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A\n- [ ] B\n");
		const [a, b] = (await svc.dayView(T)).list;
		const writes = store.writes;
		await svc.postponeAll([a.key, b.key], "2026-11-02");
		expect(store.writes).toBe(writes + 1);
		expect((await svc.soonWithoutDateView()).length).toBe(0);
		expect((await svc.dayView("2026-11-02")).list.map((i) => i.text)).toEqual(["A", "B"]);
	});

	it("leave a done task where it is", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A\n\n## Done\n\n- [x] D\n");
		const [a] = (await svc.dayView(T)).list;
		const [d] = await svc.doneView();
		await svc.postponeAll([a.key, d.key], "2026-11-02");
		expect(store.text).toContain("- [x] D\n");
		expect(store.text).not.toContain("- [x] D 📅");
	});

	it("delete every picked task in one write", async () => {
		const { store, svc } = setup("## Now\n\n- [ ] A\n- [ ] B\n- [ ] C\n");
		const [a, , c] = (await svc.dayView(T)).list;
		const writes = store.writes;
		await svc.removeAll([a.key, c.key]);
		expect(store.writes).toBe(writes + 1);
		expect((await svc.dayView(T)).list.map((i) => i.text)).toEqual(["B"]);
	});
});

describe("renaming a section", () => {
	it("answers whether it wrote: a blank or the same name writes nothing", async () => {
		const { store, svc } = setup("## Now\n\n### X\n- [ ] A\n");
		expect(await svc.renameGroup("now", "X", "  ")).toBe(false);
		expect(await svc.renameGroup("now", "X", "X")).toBe(false);
		expect(store.writes).toBe(0);
		expect(await svc.renameGroup("now", "X", "Y")).toBe(true);
		expect(store.text).toContain("### Y\n");
	});
});
