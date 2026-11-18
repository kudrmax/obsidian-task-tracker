import { describe, expect, it } from "vitest";
import { listView, type ScreenView, type TaskItem } from "../../core/application/contracts";
import { DayServiceImpl } from "../../core/application/DayServiceImpl";
import { memoryProjectsScreen, type Clock, type Ticker } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

/**
 * The reads every frontend takes a column's list, a task's place, a block's now line and a project by name from: the
 * Obsidian screen, the iPhone app and the agents' program draw the same answers (agent CLI spec, «Core changes»).
 */

const T = "2026-11-18";
const at = (hour: number, minute = 0) => new Date(2026, 10, 18, hour, minute);
const clockAt = (moment: Date): Clock => ({ now: () => moment });
const noTicks: Ticker = { every: () => () => undefined };

const FILE = [
	"## Inbox",
	"",
	"- [ ] Idea 🗂️ Отчёты",
	"",
	"## Projects",
	"",
	"- Отчёты",
	"\t- Квартальный",
	"- Дом",
	"- Архив 🗃️",
	"",
	"## Now",
	"",
	"- [ ] Standup ⏰ 2026-11-18 10:00-10:30",
	"- [ ] Late call ⏰ 2026-11-19 00:30-01:00",
	"- [ ] Write report 🗂️ Отчёты",
	"### Evening",
	"- [ ] Read",
	"### Later",
	"",
	"## Soon",
	"",
	"- [ ] Undated 🗂️ Квартальный",
	"- [ ] Thursday thing 📅 2026-11-21",
	"- [ ] Slotted friday 📅 2026-11-20 ⏰ 2026-11-22 09:00-10:00",
	"### Morning",
	"",
	"## Backlog",
	"",
	"- [ ] Someday 🗂️ Дом",
	"",
	"## Done",
	"",
	"- [x] Old report 🗂️ Отчёты",
	"",
].join("\n");

function service(moment = at(13, 5), text: string = FILE, subprojects = true) {
	const store = new InMemoryTaskFileStore(text);
	const settings = new FakeSettingsStore(DEFAULT_SETTINGS);
	const tasks = new TaskServiceImpl(store, settings, clockAt(moment), null, undefined, memoryProjectsScreen({ subprojects }));
	const days = new DayServiceImpl(clockAt(moment), settings, tasks, noTicks);
	return { tasks, days, store };
}

const flat = (items: readonly TaskItem[]): TaskItem[] => items.flatMap((i) => [i, ...flat(i.allSubtasks)]);
const all = (s: ScreenView): TaskItem[] => flat([...s.inbox, ...s.day.list, ...s.day.slotted, ...s.soon, ...s.backlog, ...s.done]);
const named = (s: ScreenView, title: string): TaskItem => all(s).find((i) => i.title === title)!;
const titles = (items: readonly TaskItem[]) => items.map((i) => i.title);

describe("a slot after midnight (a bug: screenOf said the next day)", () => {
	it("stands on the night's timeline, and search and find open that day: the day starts at 5, 00:30 on the 19th is the 18th's", async () => {
		const { tasks } = service();
		const screen = await tasks.screen(T);
		expect(titles(screen.day.slotted)).toEqual(["Standup", "Late call"]);
		const call = named(screen, "Late call");
		expect(call.day).toBe(T);
		expect(await tasks.screenOf(call)).toEqual({ kind: "day", date: T });
		expect(await tasks.placeOf(call)).toEqual({ kind: "today", date: T });
		expect(titles((await tasks.screen("2026-11-19")).day.slotted)).toEqual([]);
	});

	it("at 02:00 the day is still yesterday's, and the slot stays on it", async () => {
		const { tasks, days } = service(new Date(2026, 10, 19, 2, 0));
		expect(days.today()).toBe(T);
		const screen = await tasks.screen(T);
		expect(await tasks.placeOf(named(screen, "Late call"))).toEqual({ kind: "today", date: T });
	});
});

describe("columnView: a column's grouped list, the one copy the screens and the program draw", () => {
	it("is listView over the column's items with the sections the column shows, empty sections in", async () => {
		const { tasks } = service();
		const screen = await tasks.screen(T);
		const day = tasks.columnView(screen, "day");
		expect(day.sections).toEqual({ list: "now", date: null });
		expect(day).toEqual({ sections: day.sections, ...listView(screen.day.list, true, screen.sections.now) });
		expect(day.groups.map((g) => [g.name, titles(g.items)])).toEqual([
			[null, ["Write report"]],
			["Evening", ["Read"]],
			["Later", []],
		]);
		const soon = tasks.columnView(screen, "soon");
		expect(soon.groups.map((g) => [g.name, titles(g.items)])).toEqual([
			[null, ["Undated"]],
			["Morning", []],
		]);
		expect(tasks.columnView(screen, "inbox").groups.map((g) => titles(g.items))).toEqual([["Idea"]]);
		expect(tasks.columnView(screen, "backlog").groups.map((g) => titles(g.items))).toEqual([["Someday"]]);
	});

	it("on a later day is Soon's sections with that day's tasks; a past day shows none", async () => {
		const { tasks } = service();
		const thursday = await tasks.screen("2026-11-21");
		const later = tasks.columnView(thursday, "day");
		expect(later.sections).toEqual({ list: "soon", date: "2026-11-21" });
		expect(later.groups.map((g) => [g.name, titles(g.items)])).toEqual([
			[null, ["Thursday thing"]],
			["Morning", []],
		]);
		const past = tasks.columnView(await tasks.screen("2026-11-10"), "day");
		expect(past.sections).toBeNull();
		expect(past.showsHeaders).toBe(false);
	});

	it("takes the screen's filter: a project's column shows its tasks, the empty sections still in", async () => {
		const { tasks } = service();
		const screen = await tasks.screen(T, "project:Отчёты");
		expect(tasks.columnView(screen, "day").groups.map((g) => [g.name, titles(g.items)])).toEqual([
			[null, ["Write report"]],
			["Later", []],
		]);
		expect(tasks.columnView(screen, "soon").groups.map((g) => [g.name, titles(g.items)])).toEqual([
			[null, ["Undated"]],
			["Morning", []],
		]);
	});
});

describe("placeOf: where Max sees a task, as By project's stage mark says it", () => {
	it("Inbox, Backlog, Soon without a date, today, a later day with its date, Done", async () => {
		const { tasks } = service();
		const screens = await Promise.all([T, "2026-11-21", "2026-11-22"].map((date) => tasks.screen(date)));
		const place = (title: string) => tasks.placeOf(screens.map((s) => named(s, title)).find((i) => i !== undefined)!);
		expect(await place("Idea")).toEqual({ kind: "inbox" });
		expect(await place("Someday")).toEqual({ kind: "backlog" });
		expect(await place("Undated")).toEqual({ kind: "soon" });
		expect(await place("Write report")).toEqual({ kind: "today", date: T });
		expect(await place("Standup")).toEqual({ kind: "today", date: T });
		expect(await place("Thursday thing")).toEqual({ kind: "day", date: "2026-11-21" });
		expect(await place("Slotted friday")).toEqual({ kind: "day", date: "2026-11-22" });
		expect(await place("Old report")).toEqual({ kind: "done" });
	});

	it("a subtask is where its task is", async () => {
		const { tasks } = service(at(13, 5), "## Soon\n\n- [ ] Parent 📅 2026-11-21\n\t- [ ] Child ⏰ 2026-11-25 10:00\n");
		const screen = await tasks.screen("2026-11-21");
		expect(await tasks.placeOf(named(screen, "Child"))).toEqual({ kind: "day", date: "2026-11-21" });
	});

	it("agrees with every card's stage mark By project", async () => {
		const { tasks } = service();
		for (const node of ["project:Отчёты", "project:Дом"]) {
			const view = await tasks.projectsScreen(node);
			for (const card of view.sections.flatMap((s) => s.cards)) {
				const place = await tasks.placeOf(card.item);
				const stage = card.stage!;
				expect({ title: card.item.title, stage: stage.kind === "date" ? { kind: "day", date: stage.date } : stage }).toEqual({ title: card.item.title, stage: place.kind === "today" ? { kind: "today" } : place });
			}
		}
		const history = await tasks.projectHistory("project:Отчёты");
		for (const card of history.flatMap((s) => s.cards)) expect(card.stage).toEqual({ kind: "done" });
	});
});

describe("ridesNow: a block of today's timeline on the now line", () => {
	it("an open task of today whose start has passed; not one still ahead, not another day's", async () => {
		const { tasks } = service();
		const screen = await tasks.screen(T);
		expect(tasks.ridesNow(named(screen, "Standup"), T)).toBe(true);
		expect(tasks.ridesNow(named(screen, "Late call"), T)).toBe(false);
		const friday = await tasks.screen("2026-11-22");
		expect(tasks.ridesNow(named(friday, "Slotted friday"), "2026-11-22")).toBe(false);
	});

	it("is what a drop's landing says", async () => {
		const { tasks } = service();
		const screen = await tasks.screen(T);
		const standup = named(screen, "Standup");
		const [landing] = await tasks.landing([{ key: standup.key, from: "timeline" }], { kind: "time", start: 5 * 60 }, T);
		if (landing.kind !== "timeline") throw new Error("not on the timeline");
		expect(landing.ridesNow).toBe(true);
		expect(tasks.ridesNow(landing.item, T)).toBe(landing.ridesNow);
	});
});

describe("projectNodeNamed", () => {
	it("finds a project as the core matches names, in the tree's spelling; a name the tree lacks is none, with the closest names", async () => {
		const { tasks } = service();
		expect(await tasks.projectNodeNamed("отчёты")).toEqual({ node: "project:Отчёты", candidates: [] });
		expect(await tasks.projectNodeNamed("Квартальный")).toEqual({ node: "project:Квартальный", candidates: [] });
		const missing = await tasks.projectNodeNamed("Отчт");
		expect(missing.node).toBeNull();
		expect(missing.candidates).toContain("Отчёты");
		expect((await tasks.projectNodeNamed("Отчоты")).candidates).toEqual(["Отчёты"]);
		expect((await tasks.projectNodeNamed("zzzzzzzzzzzz")).candidates).toEqual([]);
	});
});

describe("openTasks: every open task once, in funnel order", () => {
	it("Inbox, Backlog, Soon, today, then later days by date, each with its place", async () => {
		const { tasks } = service();
		const open = await tasks.openTasks();
		expect(open.map((t) => [t.item.title, t.place.kind])).toEqual([
			["Idea", "inbox"],
			["Someday", "backlog"],
			["Undated", "soon"],
			["Standup", "today"],
			["Late call", "today"],
			["Write report", "today"],
			["Read", "today"],
			["Thursday thing", "day"],
			["Slotted friday", "day"],
		]);
	});

	it("with the filter: a project's branch, or its own tasks with Subprojects off", async () => {
		expect((await service().tasks.openTasks("project:Отчёты")).map((t) => t.item.title)).toEqual(["Idea", "Undated", "Write report"]);
		expect((await service(at(13, 5), FILE, false).tasks.openTasks("project:Отчёты")).map((t) => t.item.title)).toEqual(["Idea", "Write report"]);
		expect((await service().tasks.openTasks("none")).map((t) => t.item.title)).toEqual(["Standup", "Late call", "Read", "Thursday thing", "Slotted friday"]);
	});

	it("names a task of two projects once", async () => {
		const { tasks } = service(at(13, 5), "## Projects\n\n- A\n- B\n\n## Now\n\n- [ ] Both 🗂️ A 🗂️ B\n");
		expect((await tasks.openTasks()).map((t) => t.item.title)).toEqual(["Both"]);
	});
});

describe("projectHistory: a live project's closed tasks", () => {
	it("its own and its subprojects', By project; a done project has none here, its screen shows them", async () => {
		const { tasks } = service(at(13, 5), "## Projects\n\n- A\n\t- A1\n- Z\n\n## Now\n\n- [ ] Open 🗂️ A\n\n## Done\n\n- [x] Closed own 🗂️ A\n- [x] Closed sub 🗂️ A1\n- [x] Z closed 🗂️ Z\n");
		const history = await tasks.projectHistory("project:A");
		expect(history.map((s) => [s.title, s.cards.map((c) => c.item.title)])).toEqual([
			[null, ["Closed own"]],
			["A1", ["Closed sub"]],
		]);
		expect(await tasks.projectHistory("project:Z")).toEqual([]);
		expect(await tasks.projectHistory("project:Nothing")).toEqual([]);
	});
});

describe("the days the program asks for", () => {
	it("this week and the next, Monday to Sunday; days from a date", () => {
		const { days } = service();
		expect(days.week("this")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
		expect(days.week("next")[0]).toBe("2026-11-23");
		expect(days.week("next")[6]).toBe("2026-11-29");
		expect(days.days("2026-11-30", 3)).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
	});

	it("a day by its words: a date, today, tomorrow, yesterday, +N and -N; anything else none", () => {
		const { days } = service();
		expect(days.dayNamed("2026-12-01")).toBe("2026-12-01");
		expect(days.dayNamed("today")).toBe(T);
		expect(days.dayNamed("tomorrow")).toBe("2026-11-19");
		expect(days.dayNamed("yesterday")).toBe("2026-11-17");
		expect(days.dayNamed("+3")).toBe("2026-11-21");
		expect(days.dayNamed("-2")).toBe("2026-11-16");
		for (const bad of ["2026-13-01", "2026-02-30", "soon", "", "+", "3", "2026-1-1"]) expect(days.dayNamed(bad)).toBeNull();
	});

	it("the weekday's name and which side of today a day is", () => {
		const { days } = service();
		expect(days.weekday(T)).toBe("Wednesday");
		expect([days.side("2026-11-17"), days.side(T), days.side("2026-11-19")]).toEqual(["past", "today", "future"]);
	});
});
