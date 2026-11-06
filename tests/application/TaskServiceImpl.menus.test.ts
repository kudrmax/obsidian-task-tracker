import { describe, expect, it } from "vitest";
import { StaleTaskError } from "../../src/application/contracts";
import type { Clock } from "../../src/application/ports";
import { TaskServiceImpl } from "../../src/application/TaskServiceImpl";
import { DEFAULT_SETTINGS } from "../../src/settings";
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
	it("reads the levels and labels of the settings", async () => {
		const { svc } = setup("## Now\n\n- [ ] p1 A\n");
		const menu = svc.menu((await svc.dayView(T)).list, T);
		expect(menu.levels.tiles.map((t) => [t.level.prefix, t.on])).toEqual(DEFAULT_SETTINGS.priorities.map((l) => [l.prefix, l.prefix === "p1"]));
		expect(menu.labels).toEqual({ tiles: [{ label: { name: "Важное", color: "red" }, on: false }, { label: { name: "Срочное", color: "orange" }, on: false }], disabled: true });
		expect(menu.moves.map((m) => m.id)).toEqual(["tomorrow", "pick"]);
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
