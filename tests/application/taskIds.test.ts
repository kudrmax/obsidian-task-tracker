import { describe, expect, it } from "vitest";
import type { ScreenView, TaskItem } from "../../core/application/contracts";
import type { Clock } from "../../core/application/ports";
import { TaskIdentity } from "../../core/application/TaskIdentity";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

/**
 * A task's `id` is who it is for the life of the service: the same through every write the service makes to it and
 * through re-reads of the file, new for a task made, gone for a task removed.
 */

const T = "2026-10-30";
const LATER = "2026-11-03";
const clock: Clock = { now: () => new Date(2026, 9, 30, 14, 20) };

const FILE = [
	"## Inbox",
	"",
	"- [ ] Idea",
	"",
	"## Now",
	"",
	"- [ ] A",
	"- [ ] Parent",
	"\t- [ ] Child one",
	"\t- [ ] Child two",
	"- [ ] Other parent",
	"\t- [ ] Other child",
	"- [ ] Run 📅 2026-10-30 🔁 every day",
	"### Errands",
	"- [ ] Shop",
	"",
	"## Soon",
	"",
	"- [ ] Later",
	"",
	"## Backlog",
	"",
	"- [ ] Someday",
	"",
	"## Done",
	"",
].join("\n");

function setup(text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, labels: [{ name: "Fast", color: "green" }] });
	const identity = new TaskIdentity();
	const history = new UndoHistory(store, identity);
	const svc = new TaskServiceImpl(store, settings, clock, history, undefined, undefined, identity);
	return { store, svc, history };
}

const flat = (items: readonly TaskItem[]): TaskItem[] => items.flatMap((i) => [i, ...flat(i.allSubtasks)]);
const everyItem = (s: ScreenView): TaskItem[] => flat([...s.inbox, ...s.day.list, ...s.day.slotted, ...s.soon, ...s.backlog, ...s.done]);

/** Every task: today's screen, and the days ahead a write may date one to. */
async function items(svc: TaskServiceImpl): Promise<TaskItem[]> {
	const ahead = await Promise.all(["2026-10-31", LATER].map((day) => svc.dayView(day)));
	return [...everyItem(await svc.screen(T)), ...flat(ahead.flatMap((d) => [...d.list, ...d.slotted]))];
}

async function item(svc: TaskServiceImpl, title: string): Promise<TaskItem> {
	const found = (await items(svc)).filter((i) => i.title === title);
	if (found.length !== 1) throw new Error(`${found.length} tasks titled ${title}`);
	return found[0];
}

async function ids(svc: TaskServiceImpl): Promise<Record<string, string>> {
	return Object.fromEntries((await items(svc)).map((i) => [i.title, i.id]));
}

/** Every write keeps the id of the task it changes, and of every other task. */
async function keeps(write: (svc: TaskServiceImpl, it: TaskItem) => Promise<unknown>, title = "A", renamed = title): Promise<void> {
	const { svc } = setup();
	const before = await ids(svc);
	await write(svc, await item(svc, title));
	const after = await ids(svc);
	expect(after[renamed]).toBe(before[title]);
	for (const [name, id] of Object.entries(before)) if (name !== title) expect(after[name]).toBe(id);
}

describe("a task's id", () => {
	it("is on every task and subtask, each its own", async () => {
		const { svc } = setup();
		const all = await items(svc);
		expect(all.length).toBe(11);
		expect(all.every((i) => typeof i.id === "string" && i.id !== "")).toBe(true);
		expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
	});

	it("stays through re-reads of a file nothing changed", async () => {
		const { svc } = setup();
		const first = await ids(svc);
		expect(await ids(svc)).toEqual(first);
		expect(Object.fromEntries((await svc.dayView(T)).list.map((i) => [i.title, i.id]))).toMatchObject({ A: first.A, Parent: first.Parent });
	});

	it("is the same in every place the task is shown: lists, the timeline, search, a found task", async () => {
		const { svc } = setup();
		const a = await item(svc, "A");
		await svc.setSlot(a.key, { date: T, start: 600, end: 660 });
		const screen = await svc.screen(T);
		expect(screen.day.slotted.map((i) => i.id)).toEqual([a.id]);
		const hits = (await svc.search("A")).flatMap((g) => g.hits.map((h) => h.item));
		expect(hits.find((h) => h.title === "A")?.id).toBe(a.id);
		expect((await svc.find(screen.day.slotted[0].key, "A"))?.id).toBe(a.id);
	});
});

describe("every write keeps it", () => {
	it("status in progress", () => keeps((svc, a) => svc.setStatus(a.key, "inProgress")));
	it("done: the task goes to Done", () => keeps((svc, a) => svc.setStatus(a.key, "done")));
	it("won't do", () => keeps((svc, a) => svc.pickStatus([a.key], "wontDo")));
	it("toggle done", () => keeps((svc, a) => svc.toggleDone(a.key)));
	it("priority", () => keeps((svc, a) => svc.setPriority(a.key, "p1")));
	it("labels", () => keeps((svc, a) => svc.setLabels(a.key, ["Fast"])));
	it("due date: Now to Soon", () => keeps((svc, a) => svc.setDueDate(a.key, LATER)));
	it("due date taken off", () => keeps((svc, a) => svc.removeDue([a.key]), "Later"));
	it("postpone", () => keeps((svc, a) => svc.postpone(a.key, LATER)));
	it("time on the calendar and back to the list", () =>
		keeps(async (svc, a) => {
			await svc.setSlot(a.key, { date: T, start: 600, end: 660 });
			const slotted = (await svc.dayView(T)).slotted[0];
			await svc.resize(slotted.key, T, "end", 720, 15);
			await svc.clearSlot((await svc.dayView(T)).slotted[0].key, { before: null, date: T });
		}));
	it("repeat", () => keeps((svc, a) => svc.setRepeat(a.key, { kind: "schedule", every: 1, unit: "week", days: [3], dayOfMonth: null, from: null })));
	it("rename", () => keeps((svc, a) => svc.rename(a.key, "A renamed"), "A", "A renamed"));
	it("edit", () => keeps((svc, a) => svc.edit(a.key, { text: "A edited", placement: { kind: "soon" }, priority: null }), "A", "A edited"));
	it("description", () => keeps((svc, p) => svc.setDescription(p.key, "A note"), "Parent"));
	it("fold 📁", () => keeps((svc, p) => svc.toggleCollapsed(p.key), "Parent"));
	it("to Soon", () => keeps((svc, a) => svc.moveToSoon(a.key, T)));
	it("to Backlog", () => keeps((svc, a) => svc.moveToEnd(a.key, "backlog")));
	it("out of Inbox into a list", () => keeps((svc, i) => svc.moveToList(i.key, T), "Idea"));
	it("before another task", () => keeps(async (svc, a) => svc.moveBefore(a.key, (await item(svc, "Shop")).key, T)));
	it("into a section", () => keeps((svc, a) => svc.moveToGroup(a.key, "now", "Errands", null)));
	it("into a new section", () => keeps((svc, a) => svc.createGroup(a.key, "now", "Fresh")));
	it("to a section from the menu", () => keeps((svc, a) => svc.toSection([a.key], "Errands")));
	it("into a project", () => keeps((svc, a) => svc.setProject([a.key], "P")));
	it("a drop on the timeline", () => keeps((svc, a) => svc.drop([{ key: a.key, from: "day" }], { kind: "time", start: 600 }, T)));
	it("a drop in another list", () => keeps((svc, a) => svc.drop([{ key: a.key, from: "day" }], { kind: "list", column: "inbox", before: null }, T)));
	it("several at once", () =>
		keeps(async (svc, a) => {
			const shop = await item(svc, "Shop");
			await svc.applyAll([
				{ key: a.key, change: { kind: "priority", priority: "p1" } },
				{ key: shop.key, change: { kind: "moveToSoon", date: T } },
			]);
		}));
	it("a section renamed or moved keeps the ids of its tasks", () =>
		keeps(async (svc) => {
			await svc.renameGroup("now", "Errands", "Chores");
			await svc.moveGroup("now", "Chores", "end");
		}, "Shop"));
});

describe("subtasks", () => {
	it("keep theirs through their parent's writes", async () => {
		const { svc } = setup();
		const before = await ids(svc);
		const parent = await item(svc, "Parent");
		await svc.setPriority(parent.key, "p1");
		await svc.rename((await item(svc, "Parent")).key, "Parent renamed");
		await svc.setDescription((await item(svc, "Parent renamed")).key, "Notes\n- a point");
		await svc.toggleCollapsed((await item(svc, "Parent renamed")).key);
		await svc.setStatus((await item(svc, "Parent renamed")).key, "done");
		const after = await ids(svc);
		expect(after["Parent renamed"]).toBe(before.Parent);
		expect(after["Child one"]).toBe(before["Child one"]);
		expect(after["Child two"]).toBe(before["Child two"]);
	});

	it("keep theirs through their own writes", () => keeps((svc, c) => svc.setStatus(c.key, "done"), "Child one"));

	it("keep it moved under another parent, and out of any", async () => {
		const { svc } = setup();
		const before = await ids(svc);
		const child = await item(svc, "Child two");
		await svc.nest(child.key, (await item(svc, "Other parent")).key, null);
		expect((await item(svc, "Other parent")).allSubtasks.map((s) => s.id)).toEqual([before["Other child"], before["Child two"]]);
		await svc.moveBefore((await item(svc, "Child two")).key, (await item(svc, "Shop")).key, T);
		const after = await ids(svc);
		expect(after["Child two"]).toBe(before["Child two"]);
		expect((await item(svc, "Child two")).isSubtask).toBe(false);
		await svc.nest((await item(svc, "A")).key, (await item(svc, "Parent")).key, (await item(svc, "Child one")).key);
		expect((await item(svc, "Parent")).allSubtasks.map((s) => s.id)).toEqual([before.A, before["Child one"]]);
	});
});

describe("a task made or removed", () => {
	it("a task made has a new id, already on the item a write answers", async () => {
		const { svc } = setup();
		const before = new Set(Object.values(await ids(svc)));
		const key = await svc.createInPlace("Fresh", null, { kind: "list", list: "inbox", group: null, before: null });
		const fresh = await item(svc, "Fresh");
		expect(fresh.key).toEqual(key);
		expect(before.has(fresh.id)).toBe(false);
		const renamed = await svc.rename(fresh.key, "Fresh renamed");
		expect(renamed?.id).toBe(fresh.id);
		await svc.createSubtask((await item(svc, "Fresh renamed")).key, { text: "Sub", placement: { kind: "inbox" }, priority: null });
		const sub = await item(svc, "Sub");
		expect(before.has(sub.id) || sub.id === fresh.id).toBe(false);
	});

	it("a repeating task closed keeps its id in Done; its next copy is new", async () => {
		const { svc } = setup();
		const run = await item(svc, "Run");
		await svc.setStatus(run.key, "done");
		const runs = (await items(svc)).filter((i) => i.title === "Run");
		expect(runs).toHaveLength(2);
		expect(runs.find((r) => r.status === "done")?.id).toBe(run.id);
		expect(runs.find((r) => r.open)?.id).not.toBe(run.id);
	});

	it("a task removed takes its id away; the others keep theirs", async () => {
		const { svc } = setup();
		const before = await ids(svc);
		await svc.remove((await item(svc, "A")).key);
		const after = await ids(svc);
		expect(Object.values(after)).not.toContain(before.A);
		const { A: _gone, ...rest } = before;
		expect(after).toEqual(rest);
	});

	it("a removed task's subtasks go with it", async () => {
		const { svc } = setup();
		const before = await ids(svc);
		await svc.removeAll([(await item(svc, "Parent")).key]);
		const after = Object.values(await ids(svc));
		expect(after).not.toContain(before["Child one"]);
		expect(after).toContain(before["Other child"]);
	});
});

describe("two identical lines", () => {
	const TWINS = "## Inbox\n\n## Now\n\n- [ ] X\n- [ ] X\n- [ ] Y\n\n## Soon\n\n## Backlog\n\n## Done\n";

	it("are two tasks: a write to the second keeps each its own id", async () => {
		const { svc } = setup(TWINS);
		const [first, second] = (await svc.dayView(T)).list;
		expect(first.id).not.toBe(second.id);
		await svc.setStatus(second.key, "inProgress");
		const [a, b] = (await svc.dayView(T)).list;
		expect([a.id, a.status, b.id, b.status]).toEqual([first.id, "todo", second.id, "inProgress"]);
	});

	it("are told apart when the second moves above the first", async () => {
		const { svc } = setup(TWINS);
		const [first, second, y] = (await svc.dayView(T)).list;
		await svc.moveBefore(second.key, first.key, T);
		await svc.setPriority((await svc.dayView(T)).list[0].key, "p1");
		const after = (await svc.dayView(T)).list;
		expect(after.map((i) => i.id)).toEqual([second.id, first.id, y.id]);
		expect(after[0].priority?.prefix).toBe("p1");
	});
});

describe("an edit from elsewhere", () => {
	it("keeps the id of every line it leaves in place, and of a line edited in place", async () => {
		const { store, svc } = setup();
		const before = await ids(svc);
		store.text = store.text!.replace("- [ ] Later", "- [ ] Later\n- [ ] Typed elsewhere").replace("- [ ] Shop", "- [ ] Shop for food");
		store.emitChange();
		const after = await ids(svc);
		expect(after["Shop for food"]).toBe(before.Shop);
		for (const [name, id] of Object.entries(before)) if (name !== "Shop") expect(after[name]).toBe(id);
		expect(Object.values(before)).not.toContain(after["Typed elsewhere"]);
	});

	it("drops the id of a line it removes, and gives a moved line a new one", async () => {
		const { store, svc } = setup();
		const before = await ids(svc);
		store.text = store.text!.replace("- [ ] Idea\n", "").replace("- [ ] Someday", "- [ ] Someday\n- [ ] Idea");
		store.emitChange();
		const after = await ids(svc);
		expect(after.Idea).not.toBe(before.Idea);
		expect(after.Someday).toBe(before.Someday);
	});

	it("of a twin keeps the twin it left in place", async () => {
		const { store, svc } = setup("## Inbox\n\n## Now\n\n- [ ] X\n- [ ] Y\n- [ ] X\n\n## Soon\n\n## Backlog\n\n## Done\n");
		const [x1, y, x2] = (await svc.dayView(T)).list;
		store.text = store.text!.replace("- [ ] X\n- [ ] Y\n", "- [ ] Y\n");
		store.emitChange();
		const list = (await svc.dayView(T)).list;
		expect(list.map((i) => i.id)).toEqual([y.id, x2.id]);
		expect(list.map((i) => i.id)).not.toContain(x1.id);
	});

	it("keeps ids between a write and the next one", async () => {
		const { store, svc } = setup();
		const before = await ids(svc);
		store.text = store.text!.replace("- [ ] Later", "- [ ] Later edited");
		await svc.setStatus((await item(svc, "A")).key, "inProgress");
		const after = await ids(svc);
		expect(after["Later edited"]).toBe(before.Later);
		expect(after.A).toBe(before.A);
	});
});

describe("undo", () => {
	it("gives a task back with the id it had: a move, a status, a removal", async () => {
		const { svc, history } = setup();
		const before = await ids(svc);
		await svc.moveToEnd((await item(svc, "A")).key, "backlog");
		await svc.setStatus((await item(svc, "Shop")).key, "done");
		await svc.remove((await item(svc, "Parent")).key);
		expect(await history.undo()).toBe("done");
		expect(await history.undo()).toBe("done");
		expect(await history.undo()).toBe("done");
		expect(await ids(svc)).toEqual(before);
		expect(await history.redo()).toBe("done");
		const redone = await ids(svc);
		expect(redone.A).toBe(before.A);
	});

	it("of a write to one of two twins keeps each its own", async () => {
		const { svc, history } = setup("## Inbox\n\n## Now\n\n- [ ] X\n- [ ] X\n\n## Soon\n\n## Backlog\n\n## Done\n");
		const [first, second] = (await svc.dayView(T)).list;
		await svc.moveToEnd(second.key, "backlog");
		await history.undo();
		expect((await svc.dayView(T)).list.map((i) => i.id)).toEqual([first.id, second.id]);
	});
});

describe("a section's id", () => {
	const sectionIds = async (svc: TaskServiceImpl) => Object.fromEntries((await svc.listSections()).now.map((s) => [s.name ?? "", s.id]));

	it("is on every section, No section's too, each its own", async () => {
		const { svc } = setup();
		const sections = (await svc.screen(T)).sections.now;
		expect(sections.map((s) => s.name)).toEqual([null, "Errands"]);
		expect(new Set(sections.map((s) => s.id)).size).toBe(2);
		expect(sections.every((s) => typeof s.id === "string" && s.id !== "")).toBe(true);
	});

	it("stays through a rename, a move, its tasks' writes and re-reads", async () => {
		const { svc } = setup();
		await svc.createGroup((await item(svc, "A")).key, "now", "Home");
		const before = await sectionIds(svc);
		await svc.renameGroup("now", "Errands", "Chores");
		await svc.moveGroup("now", "Chores", { before: "Home" });
		await svc.setStatus((await item(svc, "Shop")).key, "inProgress");
		await svc.moveToGroup((await item(svc, "Later")).key, "now", "Chores", null);
		const after = await sectionIds(svc);
		expect(after.Chores).toBe(before.Errands);
		expect(after.Home).toBe(before.Home);
		expect(after[""]).toBe(before[""]);
		expect(await sectionIds(svc)).toEqual(after);
	});

	it("is the same on the groups a column draws, and in a list grouped by project", async () => {
		const { svc } = setup();
		const screen = await svc.screen(T);
		const errands = screen.sections.now.find((s) => s.name === "Errands")!;
		await svc.setProject([(await item(svc, "Later")).key], "P");
		await svc.toSection([(await item(svc, "Later")).key], "Errands");
		await svc.setGrouping("soon", true);
		const grouped = (await svc.screen(T)).projects.soon.groups;
		const ids = grouped.flatMap((g) => g.sections.filter((s) => s.name === "Errands").map((s) => s.id));
		expect(ids.length).toBeGreaterThan(0);
		const soonErrands = (await svc.listSections()).soon.find((s) => s.name === "Errands")!;
		expect(ids.every((id) => id === soonErrands.id)).toBe(true);
		expect(soonErrands.id).not.toBe(errands.id);
	});

	it("a section made gets a new one; renamed elsewhere in place, it keeps its own", async () => {
		const { store, svc } = setup();
		const before = await sectionIds(svc);
		store.text = store.text!.replace("### Errands", "### Errands and more");
		store.emitChange();
		expect((await sectionIds(svc))["Errands and more"]).toBe(before.Errands);
		await svc.createSection("Fresh", { kind: "list", list: "now", group: null, before: null });
		const fresh = (await sectionIds(svc)).Fresh;
		expect(Object.values(before)).not.toContain(fresh);
	});

	it("comes back with undo of a rename", async () => {
		const { svc, history } = setup();
		const before = await sectionIds(svc);
		await svc.renameGroup("now", "Errands", "Chores");
		await history.undo();
		expect(await sectionIds(svc)).toEqual(before);
	});
});

describe("a file not yet tidied for today", () => {
	const UNTIDY = "## Inbox\n\n- [ ] Idea\n\n## Now\n\n- [ ] A\n- [x] Finished ✅ 2026-10-29\n- [ ] B\n\n## Soon\n\n- [ ] Later 📅 2026-10-30\n- [ ] S2\n\n## Backlog\n\n## Done\n";

	it("keeps every id over reads that do not tidy it, the tasks tidying moves too", async () => {
		const { svc } = setup(UNTIDY);
		const day = async () => Object.fromEntries([...(await svc.dayView(T)).list, ...(await svc.inboxView()), ...(await svc.doneView())].map((i) => [i.title, i.id]));
		const first = await day();
		expect(first.Later).toBeDefined();
		for (let n = 0; n < 3; n++) expect(await day()).toEqual(first);
		await svc.normalize();
		expect(await day()).toEqual(first);
	});

	it("keeps a task's id from its landing to the drop, for a task tidying moves", async () => {
		const { store, svc } = setup(UNTIDY);
		const later = (await svc.dayView(T)).list.find((i) => i.title === "Later")!;
		const [landing] = await svc.landing([{ key: later.key, from: "day" }], { kind: "time", start: 600 }, T);
		expect(landing.id).toBe(later.id);
		expect(store.text).toBe(UNTIDY);
		await svc.drop([{ key: later.key, from: "day" }], { kind: "time", start: 600 }, T);
		expect((await svc.dayView(T)).slotted.map((i) => i.id)).toEqual([later.id]);
	});
});
