import { describe, expect, it } from "vitest";
import { StaleTaskError, type TaskItem, type TaskKey } from "../../core/application/contracts";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";
import type { Clock } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { TaskIdentity } from "../../core/application/TaskIdentity";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

/**
 * A key the core gave stays good while its task is there: Max acts in the middle of an animation, and a write made just
 * before (Done on the task above, a task added above) has moved every line under it. The task is found by its id.
 */

const T = "2026-10-30";
const LATER = "2026-11-03";
const clock: Clock = { now: () => new Date(2026, 9, 30, 14, 20) };
const FILE = [
	"## Inbox",
	"",
	"- [ ] I",
	"",
	"## Now",
	"",
	"- [ ] A",
	"- [ ] B",
	"- [ ] P",
	"\t- [ ] P1",
	"\t- [ ] P2",
	"- [ ] Q",
	"### Errands",
	"- [ ] E",
	"",
	"## Soon",
	"",
	"- [ ] S",
	"",
	"## Backlog",
	"",
	"- [ ] K",
	"",
	"## Done",
	"",
].join("\n");

function setup(text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, labels: [{ name: "Fast", color: "green" }] });
	return { store, svc: new TaskServiceImpl(store, settings, clock) };
}

type Svc = ReturnType<typeof setup>["svc"];

const flat = (items: readonly TaskItem[]): TaskItem[] => items.flatMap((i) => [i, ...flat(i.allSubtasks)]);

async function items(svc: Svc): Promise<TaskItem[]> {
	const s = await svc.screen(T);
	const later = await svc.dayView(LATER);
	return flat([...s.inbox, ...s.day.list, ...s.day.slotted, ...s.soon, ...s.backlog, ...s.done, ...later.list, ...later.slotted]);
}

async function byTitle(svc: Svc): Promise<Record<string, TaskItem>> {
	return Object.fromEntries((await items(svc)).map((i) => [i.title, i]));
}

/** The writes that move lines above or around the task: Done on the task above, a task added above everything. */
const SHIFTS: readonly (readonly [string, (svc: Svc, t: Record<string, TaskItem>) => Promise<unknown>])[] = [
	["Done on the task above", (svc, t) => svc.setStatus(t.A.key, "done")],
	["a task added above", (svc) => svc.createInPlace("New", null, { kind: "list", list: "now", group: null, before: null })],
	["the task above removed", (svc, t) => svc.remove(t.A.key)],
];

/** Each write, made with keys read before the shift, and what the file then shows for the task it names. */
const WRITES: readonly (readonly [string, (svc: Svc, t: Record<string, TaskItem>) => Promise<unknown>, (t: Record<string, TaskItem>) => void])[] = [
	["setStatus", (svc, t) => svc.setStatus(t.B.key, "inProgress"), (t) => expect(t.B.status).toBe("inProgress")],
	["toggleDone", (svc, t) => svc.toggleDone(t.B.key), (t) => expect(t.B.status).toBe("done")],
	["pickStatus", (svc, t) => svc.pickStatus([t.B.key, t.Q.key], "wontDo"), (t) => expect([t.B.status, t.Q.status]).toEqual(["cancelled", "cancelled"])],
	["setPriority", (svc, t) => svc.setPriority(t.B.key, "p1"), (t) => expect(t.B.priority?.prefix).toBe("p1")],
	["setLabels", (svc, t) => svc.setLabels(t.B.key, ["Fast"]), (t) => expect(t.B.labels.map((l) => l.name)).toEqual(["Fast"])],
	["togglePriority", (svc, t) => svc.togglePriority([t.B.key], "p2"), (t) => expect(t.B.priority?.prefix).toBe("p2")],
	["setDueDate", (svc, t) => svc.setDueDate(t.B.key, LATER), (t) => expect(t.B.dueDate).toBe(LATER)],
	["postpone", (svc, t) => svc.postpone(t.B.key, LATER), (t) => expect(t.B.dueDate).toBe(LATER)],
	["setSlot", (svc, t) => svc.setSlot(t.B.key, { date: T, start: 960, end: null }), (t) => expect(t.B.slot?.start).toBe(960)],
	["setRepeat", (svc, t) => svc.setRepeat(t.B.key, { kind: "schedule", every: 1, unit: "week", days: [3], dayOfMonth: null, from: null }), (t) => expect(t.B.repeat).not.toBeNull()],
	["rename", (svc, t) => svc.rename(t.B.key, "B renamed"), (t) => expect(t["B renamed"]).toBeDefined()],
	["edit", (svc, t) => svc.edit(t.B.key, { text: "B edited", placement: { kind: "soon" }, priority: null }), (t) => expect(t["B edited"].list).toBe("soon")],
	["setDescription", (svc, t) => svc.setDescription(t.B.key, "A note"), (t) => expect(t.B.description).toBe("A note")],
	["toggleCollapsed", (svc, t) => svc.toggleCollapsed(t.P.key), (t) => expect(t.P.collapsed).toBe(true)],
	["setProject", (svc, t) => svc.setProject([t.B.key], "Proj"), (t) => expect(t.B.project?.name).toBe("Proj")],
	["moveToEnd", (svc, t) => svc.moveToEnd(t.B.key, "backlog"), (t) => expect(t.B.list).toBe("backlog")],
	["moveToSoon", (svc, t) => svc.moveToSoon(t.B.key, T), (t) => expect(t.B.list).toBe("soon")],
	["moveBefore", (svc, t) => svc.moveBefore(t.Q.key, t.B.key, T), (t) => expect(t.Q.key.index).toBeLessThan(t.B.key.index)],
	["moveToGroup", (svc, t) => svc.moveToGroup(t.B.key, "now", "Errands", t.E.key), (t) => expect(t.B.group).toBe("Errands")],
	["nest", (svc, t) => svc.nest(t.B.key, t.P.key, t.P2.key), (t) => expect(t.P.allSubtasks.map((s) => s.title)).toEqual(["P1", "B", "P2"])],
	["createSubtask", (svc, t) => svc.createSubtask(t.P.key, { text: "P3", placement: { kind: "now" }, priority: null }), (t) => expect(t.P.allSubtasks.map((s) => s.title)).toEqual(["P1", "P2", "P3"])],
	["createInPlace before", (svc, t) => svc.createInPlace("Typed", null, { kind: "list", list: "now", group: null, before: t.Q.key }), (t) => expect(t.Typed.key.index).toBe(t.Q.key.index - 1)],
	["drop on the timeline", (svc, t) => svc.drop([{ key: t.B.key, from: "day" }], { kind: "time", start: 600 }, T), (t) => expect(t.B.slot).not.toBeNull()],
	["drop in a list", (svc, t) => svc.drop([{ key: t.B.key, from: "day" }], { kind: "list", column: "soon", before: null }, T), (t) => expect(t.B.list).toBe("soon")],
	["applyAll", (svc, t) => svc.applyAll([{ key: t.Q.key, change: { kind: "moveBefore", before: t.B.key, date: T } }, { key: t.B.key, change: { kind: "priority", priority: "p1" } }]), (t) => expect([t.B.priority?.prefix, t.Q.key.index < t.B.key.index]).toEqual(["p1", true])],
	["remove", (svc, t) => svc.remove(t.B.key), (t) => expect(t.B).toBeUndefined()],
];

describe("a key given before another write moved the lines", () => {
	for (const [shift, before] of SHIFTS)
		for (const [name, write, check] of WRITES) {
			it(`${name}, after ${shift}: as with keys read after it`, async () => {
				const { store, svc } = setup();
				const read = await byTitle(svc);
				await before(svc, read);
				await write(svc, read);
				check(await byTitle(svc));
				const fresh = setup();
				await before(fresh.svc, await byTitle(fresh.svc));
				await write(fresh.svc, await byTitle(fresh.svc));
				expect(store.text).toBe(fresh.store.text);
			});
		}

	it("finds the landing and the item of a key that moved", async () => {
		const { svc } = setup();
		const read = await byTitle(svc);
		await svc.setStatus(read.A.key, "done");
		const [landing] = await svc.landing([{ key: read.B.key, from: "day" }], { kind: "time", start: 600 }, T);
		expect(landing).toMatchObject({ kind: "timeline", id: read.B.id });
		expect((await svc.find(read.B.key, "B"))?.id).toBe(read.B.id);
		expect(await svc.lineOf(read.B.key)).toBe(FILE.split("\n").indexOf("- [ ] B") - 1);
	});

	it("is refused when its task is gone", async () => {
		const { svc } = setup();
		const read = await byTitle(svc);
		await svc.remove(read.B.key);
		await expect(svc.setStatus(read.B.key, "done")).rejects.toBeInstanceOf(StaleTaskError);
		await expect(svc.rename(read.B.key, "X")).rejects.toBeInstanceOf(StaleTaskError);
	});

	it("is refused once its line was edited elsewhere, the task keeping its id; the key read after acts", async () => {
		const { store, svc } = setup();
		const read = await byTitle(svc);
		store.text = store.text!.replace("- [ ] B\n", "- [ ] B edited on the Mac\n");
		const now = await byTitle(svc);
		expect(now["B edited on the Mac"].id).toBe(read.B.id);
		await expect(svc.setStatus(read.B.key, "inProgress")).rejects.toBeInstanceOf(StaleTaskError);
		await expect(svc.remove(read.B.key)).rejects.toBeInstanceOf(StaleTaskError);
		await svc.setStatus(read.A.key, "done");
		await svc.setStatus(now["B edited on the Mac"].key, "inProgress");
		expect(store.text).toContain("- [/] B edited on the Mac\n");
	});

	it("is refused when its line was replaced elsewhere by another task, whatever id that one took", async () => {
		const { store, svc } = setup();
		const read = await byTitle(svc);
		store.text = store.text!.replace("- [ ] B\n", "- [ ] Call mom\n");
		await byTitle(svc);
		await expect(svc.remove(read.B.key)).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toContain("- [ ] Call mom\n");
	});

	it("stays good through the core's own rewrites of its line, and through undo", async () => {
		const store = new InMemoryTaskFileStore(FILE);
		const settings = new FakeSettingsStore();
		const identity = new TaskIdentity();
		const history = new UndoHistory(store, identity);
		const svc = new TaskServiceImpl(store, settings, clock, history, undefined, undefined, identity);
		const read = await byTitle(svc);
		await svc.setPriority(read.B.key, "p1");
		await svc.rename(read.B.key, "B renamed");
		await svc.setStatus(read.A.key, "done");
		await svc.setStatus(read.B.key, "inProgress");
		expect(store.text).toContain("- [/] p1 B renamed\n");
		await history.undo();
		await history.undo();
		expect(store.text).toContain("- [ ] p1 B renamed\n");
		await svc.setStatus(read.B.key, "inProgress");
		expect(store.text).toContain("- [/] p1 B renamed\n");
		await history.undo();
		await history.undo();
		await history.undo();
		await svc.toggleDone(read.B.key);
		expect(store.text).toContain("- [x] B\n");
	});

	it("is refused when its line was replaced elsewhere by other tasks, which are new ones", async () => {
		const { store, svc } = setup();
		const read = await byTitle(svc);
		store.text = store.text!.replace("- [ ] B\n", "- [ ] Typed elsewhere\n- [ ] Another\n");
		await expect(svc.setStatus(read.B.key, "done")).rejects.toBeInstanceOf(StaleTaskError);
	});

	it("tells two identical lines apart: each key names its own twin after the lines moved", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] A\n- [ ] X\n- [ ] X\n\n## Soon\n\n## Backlog\n\n## Done\n");
		const [, first, second] = (await svc.dayView(T)).list;
		await svc.remove((await svc.dayView(T)).list[0].key);
		await svc.setStatus(second.key, "inProgress");
		expect(store.text).toContain("- [ ] X\n- [/] X\n");
		await svc.setPriority(first.key, "p1");
		expect(store.text).toContain("- [ ] p1 X\n- [/] X\n");
	});

	it("without an id, as a host builds it, is found by its place and line as before", async () => {
		const { svc } = setup();
		const read = await byTitle(svc);
		const { id: _id, ...plain } = read.B.key;
		await svc.setStatus(read.A.key, "done");
		await expect(svc.setStatus(plain as TaskKey, "done")).rejects.toBeInstanceOf(StaleTaskError);
	});
});

describe("through the door", () => {
	/** The app as it calls the door: it keeps the file and the ids each answer gives, and hands them in again. */
	class App {
		tasks = FILE;
		ids: unknown = undefined;

		call(method: string, ...args: unknown[]): Extract<DoorAnswer, { ok: true }> | Extract<DoorAnswer, { ok: false }> {
			const context: DoorContext = { tasks: this.tasks, nowMs: clock.now().getTime(), ...(this.ids !== undefined && { ids: this.ids as never }) };
			const answer = callDoor(method, JSON.parse(JSON.stringify(args)), context);
			if (answer.ok && answer.tasks !== undefined) this.tasks = answer.tasks;
			if (answer.ok && answer.ids !== undefined) this.ids = answer.ids;
			return answer;
		}

		titles(): Record<string, TaskItem> {
			const answer = this.call("tasks.screen", T);
			if (!answer.ok) throw new Error(answer.error.message);
			const s = answer.result as { inbox: TaskItem[]; day: { list: TaskItem[]; slotted: TaskItem[] }; soon: TaskItem[]; backlog: TaskItem[]; done: TaskItem[] };
			return Object.fromEntries(flat([...s.inbox, ...s.day.list, ...s.day.slotted, ...s.soon, ...s.backlog, ...s.done]).map((i) => [i.title, i]));
		}
	}

	it("finds every task by a key read before Done moved the lines", () => {
		const app = new App();
		const read = app.titles();
		expect(app.call("tasks.setStatus", read.A.key, "done").ok).toBe(true);
		for (const [method, args] of [
			["tasks.setPriority", [read.B.key, "p1"]],
			["tasks.rename", [read.Q.key, "Q renamed"]],
			["tasks.nest", [read.E.key, read.P.key, null]],
			["tasks.drop", [[{ key: read.S.key, from: "soon" }], { kind: "time", start: 600 }, T]],
			["tasks.moveToEnd", [read.I.key, "backlog"]],
		] as const)
			expect(app.call(method, ...args)).toMatchObject({ ok: true });
		const now = app.titles();
		expect(now.B.priority?.prefix).toBe("p1");
		expect(now["Q renamed"]).toBeDefined();
		expect(now.P.allSubtasks.map((s) => s.title)).toEqual(["P1", "P2", "E"]);
		expect(now.S.slot?.start).toBe(600 + DEFAULT_SETTINGS.dayStartHour * 60);
		expect(now.I.list).toBe("backlog");
	});

	it("finds a task by a key another reading of the file gave, by its place and line, never another task by an id it shares", () => {
		const writer = new App();
		writer.call("tasks.setStatus", writer.titles().A.key, "done");
		writer.call("tasks.setPriority", writer.titles().Q.key, "p1");
		const reader = new App();
		reader.tasks = writer.tasks;
		const read = reader.titles();
		expect(writer.call("tasks.setStatus", read.B.key, "inProgress")).toMatchObject({ ok: true });
		expect(writer.titles().B.status).toBe("inProgress");
		expect(writer.titles()["Q"].status).toBe("todo");
	});

	it("finds a task by a key read before this core itself rewrote its line", () => {
		const app = new App();
		const read = app.titles();
		app.call("tasks.setPriority", read.B.key, "p1");
		app.call("tasks.setStatus", read.A.key, "done");
		expect(app.call("tasks.setStatus", read.B.key, "inProgress")).toMatchObject({ ok: true });
		expect(app.titles().B).toMatchObject({ status: "inProgress", priority: { prefix: "p1" } });
	});

	it("refuses a key once its line was edited elsewhere, the card keeping its id; the fresh key acts", () => {
		const app = new App();
		const read = app.titles();
		app.tasks = app.tasks.replace("- [ ] B\n", "- [ ] B synced from the Mac\n");
		const now = app.titles();
		expect(now["B synced from the Mac"].id).toBe(read.B.id);
		expect(app.call("tasks.setStatus", read.B.key, "inProgress")).toMatchObject({ ok: false, error: { code: "staleTask" } });
		expect(app.call("tasks.setStatus", now["B synced from the Mac"].key, "inProgress")).toMatchObject({ ok: true });
	});

	it("refuses to remove by a key whose line was replaced elsewhere by another task", () => {
		const app = new App();
		const read = app.titles();
		app.tasks = app.tasks.replace("- [ ] B\n", "- [ ] Call mom\n");
		app.titles();
		expect(app.call("tasks.remove", read.B.key)).toMatchObject({ ok: false, error: { code: "staleTask" } });
		expect(app.tasks).toContain("- [ ] Call mom\n");
		const fresh = new App();
		fresh.tasks = app.tasks;
		expect(fresh.call("tasks.remove", read.B.key)).toMatchObject({ ok: false, error: { code: "staleTask" } });
	});

	it("takes a key read before Done on another task and before its own rewrite and undo", () => {
		const app = new App();
		const read = app.titles();
		app.call("tasks.setStatus", read.A.key, "done");
		app.call("tasks.setPriority", read.B.key, "p1");
		expect(app.call("tasks.setStatus", read.B.key, "inProgress")).toMatchObject({ ok: true });
		app.call("history.undo");
		app.call("history.undo");
		expect(app.call("tasks.toggleDone", read.B.key)).toMatchObject({ ok: true });
		expect(app.titles().B.status).toBe("done");
	});

	it("refuses a key whose task is gone", () => {
		const app = new App();
		const read = app.titles();
		app.call("tasks.remove", read.B.key);
		expect(app.call("tasks.setStatus", read.B.key, "done")).toMatchObject({ ok: false, error: { code: "staleTask" } });
	});

	it("without the ids handed back, finds a task by its place and line alone, never another task by an id that means nothing", () => {
		const app = new App();
		const read = app.titles();
		app.call("tasks.setStatus", read.A.key, "done");
		app.ids = undefined;
		const before = app.tasks;
		expect(app.call("tasks.setStatus", read.B.key, "inProgress")).toMatchObject({ ok: false, error: { code: "staleTask" } });
		expect(app.tasks).toBe(before);
	});
});
