import { describe, expect, it } from "vitest";
import { makeVault, NOW, run, T } from "./vault";

/**
 * Every command of obsidian-task-calendar over one fixture of Max's kind, at a fixed moment (agent CLI spec, «What an
 * agent sees»): each answer in the program's words, computed by the core the screens draw from.
 */

/** The answer without its refs, which are opaque: what the words say. */
function words(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(words);
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "ref").map(([key, v]) => [key, words(v)]));
}

const titles = (tasks: readonly { title: string }[]) => tasks.map((t) => t.title);
const sectionsOf = (sections: readonly { name: string | null; tasks: readonly { title: string }[] }[]) => sections.map((s) => [s.name, titles(s.tasks)]);

/** Every ref in an answer, at any depth. */
function refsIn(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(refsIn);
	if (value === null || typeof value !== "object") return [];
	return Object.entries(value).flatMap(([key, v]) => (key === "ref" && typeof v === "string" ? [v] : refsIn(v)));
}

describe("today", () => {
	it("is the day at Now–calendar: the list in its sections, empty ones in, the timeline by start, the meetings", async () => {
		const { answer, code } = await run(makeVault(), ["today"]);
		expect(code).toBe(0);
		expect(answer).toMatchObject({ date: T, weekday: "Wednesday", relation: "today", dayStart: "05:00", now: "2026-11-18T13:05" });
		expect(sectionsOf(answer.list.sections)).toEqual([
			[null, ["Write report"]],
			["Evening", ["Prepare talk", "Water plants"]],
			["Later", []],
		]);
		expect(titles(answer.timeline)).toEqual(["Standup", "Late call"]);
		expect(words(answer.events)).toEqual({
			allDay: [{ title: "Offsite", calendar: "Work" }],
			timed: [
				{ title: "Planning", start: "09:00", end: "09:30", startsAt: "2026-11-18T09:00", endsAt: "2026-11-18T09:30", calendar: "Work", passed: true },
				{ title: "Review", start: "15:00", end: "16:00", startsAt: "2026-11-18T15:00", endsAt: "2026-11-18T16:00", calendar: "Work", passed: false },
			],
		});
		expect(answer.calendars).toEqual({
			alert: "none",
			sources: [
				{ source: "work", tone: "plain", words: "Exported from iPhone", updated: "12:00" },
				{ source: "google", tone: "spare", words: "file missing" },
				{ source: "iphone", tone: "spare", words: "file missing" },
			],
		});
	});

	it("words each task: its place, the day, its marks, a folded task's step at any depth", async () => {
		const { answer } = await run(makeVault(), ["today"]);
		const [own, evening] = answer.list.sections;
		expect(words(own.tasks[0])).toEqual({ title: "Write report", status: "inProgress", place: "today", date: T, labels: ["Focus"], description: "Keep it short.", projects: ["Отчёты", "Ремонт"] });
		expect(words(evening.tasks[0])).toEqual({
			title: "Prepare talk",
			status: "open",
			place: "today",
			date: T,
			section: "Evening",
			progress: { done: 1, total: 2 },
			collapsed: true,
			subtasks: [
				{
					title: "Slides",
					status: "open",
					progress: { done: 0, total: 2 },
					subtasks: [
						{ title: "Gather numbers", status: "open", next: true },
						{ title: "Draw charts", status: "open" },
					],
				},
			],
			nextStep: { title: "Gather numbers", path: ["Slides", "Gather numbers"] },
		});
		expect(words(evening.tasks[1])).toEqual({ title: "Water plants", status: "open", place: "today", date: T, section: "Evening", repeat: "Every 3 days" });
		expect(words(answer.timeline[0])).toEqual({
			title: "Standup",
			status: "open",
			place: "today",
			date: T,
			time: { start: "10:00", end: "10:30", startsAt: "2026-11-18T10:00", durationMin: 30, passed: true },
			reminder: "notification",
			priority: { name: "p1", rank: 1 },
		});
	});

	it("stands the 00:30 slot on the night before: on today's timeline, its moment the next date", async () => {
		const { answer } = await run(makeVault(), ["today"]);
		expect(words(answer.timeline[1])).toEqual({
			title: "Late call",
			status: "open",
			place: "today",
			date: T,
			time: { start: "00:30", end: "01:00", startsAt: "2026-11-19T00:30", durationMin: 30, passed: false },
			reminder: "notification",
		});
		const tomorrow = (await run(makeVault(), ["day", "tomorrow"])).answer;
		expect(titles(tomorrow.timeline)).toEqual([]);
	});

	it("at 02:00 is still yesterday's date, the day starting at 5", async () => {
		const { answer } = await run(makeVault(), ["today"], new Date(2026, 10, 19, 2, 0));
		expect(answer).toMatchObject({ date: T, relation: "today", now: "2026-11-19T02:00" });
		expect(answer.timeline[1]).toMatchObject({ title: "Late call", time: { passed: true } });
	});
});

describe("day and week", () => {
	it("a task dated ahead in the file's Soon is on its day, and in no Soon", async () => {
		const vault = makeVault();
		const saturday = (await run(vault, ["day", "2026-11-21"])).answer;
		expect(saturday).toMatchObject({ date: "2026-11-21", weekday: "Saturday", relation: "future" });
		expect(saturday.now).toBeUndefined();
		expect(sectionsOf(saturday.list.sections)).toEqual([
			[null, ["Saturday thing"]],
			["Morning", []],
		]);
		expect(words(saturday.list.sections[0].tasks[0])).toEqual({ title: "Saturday thing", status: "open", place: "day", date: "2026-11-21" });
		const soon = (await run(vault, ["soon"])).answer;
		expect(soon.sections.flatMap((s: { tasks: { title: string }[] }) => titles(s.tasks))).not.toContain("Saturday thing");
	});

	it("a slot on another day than its due date: on the slot's timeline, with its due date; in its due day's list as the screen shows it", async () => {
		const vault = makeVault();
		const sunday = (await run(vault, ["day", "+4"])).answer;
		expect(sunday.date).toBe("2026-11-22");
		expect(words(sunday.timeline)).toEqual([
			{ title: "Slotted sunday", status: "open", place: "day", date: "2026-11-22", due: "2026-11-20", time: { start: "09:00", end: "10:00", startsAt: "2026-11-22T09:00", durationMin: 60, passed: false }, reminder: "notification" },
		]);
		const friday = (await run(vault, ["day", "2026-11-20"])).answer;
		expect(titles(friday.list.sections[0].tasks)).toEqual(["Slotted sunday"]);
	});

	it("a past day keeps no tasks, says why, and keeps its meetings", async () => {
		const { answer } = await run(makeVault(), ["day", "yesterday"]);
		expect(answer).toMatchObject({ date: "2026-11-17", relation: "yesterday", past: true });
		expect(answer.note).toMatch(/moved to today/);
		expect(answer.list).toEqual({ sections: [{ name: null, tasks: [] }] });
		expect(answer.timeline).toEqual([]);
		expect(answer.events).toEqual({ allDay: [], timed: [] });
		expect((await run(makeVault(), ["day", "2026-11-10"])).answer.relation).toBe("past");
	});

	it("week: Monday to Sunday of this week or the next; a day and --days N from it; seven days from today by default", async () => {
		const vault = makeVault();
		const dates = async (...argv: string[]) => (await run(vault, ["week", ...argv])).answer.days.map((d: { date: string }) => d.date);
		expect(await dates("this")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
		expect(await dates("next")).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
		expect(await dates("2026-11-30", "--days", "2")).toEqual(["2026-11-30", "2026-12-01"]);
		expect(await dates()).toEqual(["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"]);
		const week = (await run(vault, ["week", "this"])).answer.days;
		const sunday = (d: { list: { sections: { tasks: { title: string; date?: string }[] }[] }; timeline: { title: string; date?: string }[] }) => [...d.list.sections.flatMap((s) => s.tasks), ...d.timeline].filter((t) => t.title === "Slotted sunday").map((t) => t.date);
		expect(week.map(sunday)).toEqual([[], [], [], [], ["2026-11-22"], [], ["2026-11-22"]]);
		expect(week[0]).toMatchObject({ past: true });
		expect(week[2]).toMatchObject({ relation: "today" });
		expect(week[3]).toMatchObject({ relation: "tomorrow" });
	});
});

describe("the lists", () => {
	it("soon, inbox, backlog in their sections, an empty section in", async () => {
		const vault = makeVault();
		const soon = (await run(vault, ["soon"])).answer;
		expect(soon.list).toBe("soon");
		expect(sectionsOf(soon.sections)).toEqual([
			[null, ["Undated"]],
			["Morning", []],
		]);
		expect(words(soon.sections[0].tasks[0])).toEqual({ title: "Undated", status: "open", place: "soon", projects: ["Квартальный"] });
		expect(sectionsOf((await run(vault, ["inbox"])).answer.sections)).toEqual([[null, ["Idea for the report"]]]);
		expect(sectionsOf((await run(vault, ["backlog"])).answer.sections)).toEqual([[null, ["Someday"]]]);
	});

	it("with --project: the screen's filter, subprojects included unless --no-subprojects; --no-project the tasks without one", async () => {
		const vault = makeVault();
		expect(sectionsOf((await run(vault, ["soon", "--project", "отчёты"])).answer.sections)).toEqual([
			[null, ["Undated"]],
			["Morning", []],
		]);
		expect(sectionsOf((await run(vault, ["soon", "--project", "Отчёты", "--no-subprojects"])).answer.sections)).toEqual([["Morning", []]]);
		expect(sectionsOf((await run(vault, ["today", "--no-project"])).answer.list.sections)).toEqual([
			["Evening", ["Prepare talk", "Water plants"]],
			["Later", []],
		]);
	});
});

describe("all", () => {
	it("every open task once, flat, in the funnel's order; a task of two projects once", async () => {
		const { answer } = await run(makeVault(), ["all"]);
		expect(answer.tasks.map((t: { title: string; place: string; date?: string }) => [t.title, t.place, t.date ?? null])).toEqual([
			["Idea for the report", "inbox", null],
			["Someday", "backlog", null],
			["Undated", "soon", null],
			["Standup", "today", T],
			["Late call", "today", T],
			["Write report", "today", T],
			["Prepare talk", "today", T],
			["Water plants", "today", T],
			["Saturday thing", "day", "2026-11-21"],
			["Slotted sunday", "day", "2026-11-22"],
		]);
		expect(titles(answer.tasks).filter((t: string) => t === "Write report")).toHaveLength(1);
		expect(titles((await run(makeVault(), ["all", "--project", "Ремонт"])).answer.tasks)).toEqual(["Write report"]);
	});
});

describe("projects and project", () => {
	it("projects: the whole tree, folders and done projects too, done last", async () => {
		const { answer } = await run(makeVault(), ["projects"]);
		expect(answer).toEqual({
			projects: [
				{ name: "Отчёты", path: ["Отчёты"], depth: 0, status: "active" },
				{ name: "Квартальный", path: ["Отчёты", "Квартальный"], depth: 1, status: "active" },
				{ name: "Архив", path: ["Архив"], depth: 0, folder: true, status: "active" },
				{ name: "Старое", path: ["Архив", "Старое"], depth: 1, status: "active" },
				{ name: "Ремонт", path: ["Ремонт"], depth: 0, status: "active" },
				{ name: "Самолёт", path: ["Самолёт"], depth: 0, status: "done" },
			],
			noProject: { openTasks: true },
		});
	});

	it("project: its own tasks, then a part per subproject, By project's order, each task with its place", async () => {
		const { answer } = await run(makeVault(), ["project", "Отчёты"]);
		expect(answer.project).toEqual({ name: "Отчёты", folder: false, status: "active" });
		expect(answer.parts.map((p: { kind: string; title?: string; path: string[]; tasks: { title: string; place: string }[] }) => [p.kind, p.title ?? null, p.path, p.tasks.map((t) => [t.title, t.place])])).toEqual([
			["own", null, [], [["Idea for the report", "inbox"], ["Write report", "today"]]],
			["subproject", "Квартальный", ["Квартальный"], [["Undated", "soon"]]],
		]);
		const own = (await run(makeVault(), ["project", "Отчёты", "--no-subprojects"])).answer.parts;
		expect(own.map((p: { kind: string }) => p.kind)).toEqual(["own"]);
	});

	it("--done adds its history, the closed tasks; a done project shows its closed tasks; a folder its branch, Subprojects off too, as the screen keeps it", async () => {
		const done = (await run(makeVault(), ["project", "Отчёты", "--done"])).answer.parts;
		expect(done.at(-1)).toMatchObject({ kind: "done", path: [], tasks: [{ title: "Old report", status: "done", place: "done" }] });
		const plane = (await run(makeVault(), ["project", "Самолёт"])).answer;
		expect(plane.project).toEqual({ name: "Самолёт", folder: false, status: "done" });
		expect(plane.parts).toMatchObject([{ kind: "own", tasks: [{ title: "Flew", place: "done" }] }]);
		const archive = (await run(makeVault(), ["project", "Архив"])).answer;
		expect(archive.project).toEqual({ name: "Архив", folder: true, status: "active" });
		expect(archive.parts.map((p: { title?: string }) => p.title)).toEqual(["Старое"]);
		expect((await run(makeVault(), ["project", "Архив", "--no-subprojects"])).answer.parts.map((p: { title?: string }) => p.title)).toEqual(["Старое"]);
	});

	it("an unknown project is unknownProject, with the closest names, never an unfiltered answer", async () => {
		const { answer, code } = await run(makeVault(), ["project", "Отчт"]);
		expect(code).toBe(1);
		expect(answer.error).toMatchObject({ code: "unknownProject", candidates: ["Отчёты"] });
		expect((await run(makeVault(), ["soon", "--project", "Nothing"])).answer.error.code).toBe("unknownProject");
	});
});

describe("search and task", () => {
	it("search: the plugin's search, Done included, each group the list it is stored in, each task where Max sees it", async () => {
		const { answer } = await run(makeVault(), ["search", "report"]);
		expect(answer.query).toBe("report");
		expect(answer.groups.map((g: { list: string; tasks: { title: string; place: string }[] }) => [g.list, g.tasks.map((t) => [t.title, t.place])])).toEqual([
			["inbox", [["Idea for the report", "inbox"]]],
			["today", [["Write report", "today"]]],
			["done", [["Old report", "done"]]],
		]);
		const dated = (await run(makeVault(), ["search", "saturday"])).answer;
		expect(dated.groups).toMatchObject([{ list: "soon", tasks: [{ title: "Saturday thing", place: "day", date: "2026-11-21" }] }]);
	});

	it("task: the task whole, every subtask with its status, and where it is stored", async () => {
		const vault = makeVault();
		const today = (await run(vault, ["today"])).answer;
		const talk = today.list.sections[1].tasks[0];
		const { answer } = await run(vault, ["task", talk.ref]);
		expect(words(answer.task)).toMatchObject({
			title: "Prepare talk",
			place: "today",
			subtasks: [
				{ title: "Slides", status: "open", subtasks: [{ title: "Gather numbers", next: true }, { title: "Draw charts" }] },
				{ title: "Book room", status: "done" },
			],
		});
		expect(answer.stored).toEqual({ section: "Now", line: "- [ ] Prepare talk 📁" });
		const step = (await run(vault, ["task", talk.nextStep.ref])).answer;
		expect(step.task).toMatchObject({ title: "Gather numbers", place: "today", date: T });
		expect(step.stored).toEqual({ section: "Now", line: "\t\t- [ ] Gather numbers" });
	});

	it("a ref the file no longer has is staleTask; text that is no ref is unknownTask", async () => {
		const vault = makeVault();
		const ref = (await run(vault, ["inbox"])).answer.sections[0].tasks[0].ref;
		const other = makeVault({ tasks: "## Inbox\n\n- [ ] Something else\n" });
		expect((await run(other, ["task", ref])).answer.error.code).toBe("staleTask");
		expect((await run(vault, ["task", "t00000000"])).answer.error.code).toBe("staleTask");
		expect((await run(vault, ["task", "inbox-0"])).answer.error.code).toBe("unknownTask");
		expect((await run(vault, ["task", "tab"])).answer.error.code).toBe("unknownTask");
		expect((await run(vault, ["task", "T0123ABCD"])).answer.error.code).toBe("unknownTask");
	});

	it("no ref holds a list's name", async () => {
		const vault = makeVault();
		const answers = await Promise.all([["today"], ["week", "this"], ["soon"], ["inbox"], ["backlog"], ["all"], ["project", "Отчёты", "--done"], ["search", "e"]].map((argv) => run(vault, argv)));
		const refs = answers.flatMap(({ answer }) => refsIn(answer));
		expect(refs.length).toBeGreaterThan(20);
		for (const ref of refs) {
			expect(ref).toMatch(/^t[0-9a-f]{8}$/);
			expect(ref).not.toMatch(/inbox|backlog|soon|now|today|done|day/i);
		}
	});
});

describe("help and failures", () => {
	it("help: the commands, the words, Max's levels and labels in their order, and what the assistant's labels mean", async () => {
		const { answer, code } = await run(makeVault(), ["help"]);
		expect(code).toBe(0);
		expect(answer.commands.map((c: { command: string }) => c.command.split(" ")[0])).toEqual(["today", "day", "week", "soon", "inbox", "backlog", "all", "projects", "project", "search", "task", "help"]);
		expect(answer.places.map((p: { place: string }) => p.place)).toEqual(["inbox", "backlog", "soon", "today", "day", "done"]);
		expect(answer.places[4].means).toMatch(/never in Soon/);
		expect(answer.priorities).toEqual([
			{ name: "p1", rank: 1 },
			{ name: "p2", rank: 2 },
		]);
		expect(answer.labels).toEqual(["Focus", "Not now"]);
		expect(answer.assistantLabels).toEqual([
			{ action: "Best task", option: "Label", label: "Focus", means: expect.stringMatching(/Best task puts this label/) },
			{ action: "Best task", option: "Skip label", label: "Not now", means: expect.stringMatching(/can't take now/) },
		]);
		expect((await run(makeVault(), [])).answer.commands).toBeDefined();
	});

	it("an empty tasks file is no error; a missing one is tasksFileMissing", async () => {
		const empty = (await run(makeVault({ tasks: "" }), ["soon"])).answer;
		expect(empty).toEqual({ list: "soon", sections: [] });
		expect((await run(makeVault({ tasks: "" }), ["all"])).answer).toEqual({ tasks: [] });
		const missing = await run(makeVault({ tasks: null }), ["today"]);
		expect(missing.code).toBe(1);
		expect(missing.answer.error).toMatchObject({ code: "tasksFileMissing" });
	});

	it("without data.json, the plugin's defaults", async () => {
		const { answer } = await run(makeVault({ settings: null }), ["help"]);
		expect(answer.labels).toEqual([]);
		expect((await run(makeVault({ settings: null }), ["today"])).answer.date).toBe(T);
	});

	it("a command or an argument it does not know, by its code", async () => {
		const vault = makeVault();
		const code = async (...argv: string[]) => (await run(vault, argv)).answer.error.code;
		expect(await code("tomorrowish")).toBe("unknownCommand");
		expect(await code("day", "someday")).toBe("badArgument");
		expect(await code("day")).toBe("badArgument");
		expect(await code("today", "--frobnicate")).toBe("badArgument");
		expect(await code("search", "x", "--project", "Отчёты")).toBe("badArgument");
		expect(await code("week", "--days", "0")).toBe("badArgument");
		expect(await code("week", "this", "--days", "3")).toBe("badArgument");
		expect(await code("week", "next", "--days", "7")).toBe("badArgument");
		expect(await code("today", "--project", "Отчёты", "--no-project")).toBe("badArgument");
	});

	it("prints one line, or indented with --pretty", async () => {
		const vault = makeVault();
		const { runProgram } = await import("../../agent/main");
		const { agentFor } = await import("../../agent/compose");
		const plain = await runProgram(["inbox", "--vault", vault], agentFor({ now: () => NOW }));
		expect(plain.text).not.toContain("\n");
		const pretty = await runProgram(["inbox", "--vault", vault, "--pretty"], agentFor({ now: () => NOW }));
		expect(pretty.text).toContain('\n  "list": "inbox"');
	});
});
