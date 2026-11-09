import { describe, expect, it } from "vitest";
import { acceptsDrop, type DropColumn, type DroppedTask, type DropFrom, type DropOrigin, type DropTo, placesInGap, type ProjectNote, type ScreenView, type TaskItem, type TaskKey } from "../../core/application/contracts";
import { memoryGrouping } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { clock, D, type DropCase, FILE, hourAt, P, PLACES, SEVERAL, SINGLE, T } from "./dropCases";

function setup(settings = new FakeSettingsStore()) {
	const store = new InMemoryTaskFileStore(FILE);
	const svc = new TaskServiceImpl(store, settings, clock);
	return { store, svc };
}

type Svc = ReturnType<typeof setup>["svc"];

/** Every task the screen reads on these days, its subtasks too, by its text. */
async function itemsOf(svc: Svc): Promise<Map<string, TaskItem>> {
	const all: TaskItem[] = [];
	for (const day of [T, D, P]) {
		const view = await svc.dayView(day);
		all.push(...view.list, ...view.slotted);
	}
	all.push(...(await svc.soonWithoutDateView()), ...(await svc.inboxView()), ...(await svc.backlogView()));
	const byText = new Map<string, TaskItem>();
	const walk = (item: TaskItem) => {
		byText.set(item.text, item);
		item.subtasks.forEach(walk);
	};
	all.forEach(walk);
	return byText;
}

async function dropped(c: DropCase): Promise<string> {
	const { store, svc } = setup();
	const items = await itemsOf(svc);
	const key = (text: string): TaskKey => {
		const item = items.get(text);
		if (!item) throw new Error(`no task ${text}`);
		return item.key;
	};
	await svc.drop(c.tasks.map(([text, from]) => ({ key: key(text), from })), c.to(key), c.day);
	return store.text!;
}

/** The file after each drop, as the view and the bulk controller wrote it before the table moved here: `__snapshots__/drops.test.ts.snap` is that record. */
describe("what a drop writes (spec §5.1)", () => {
	describe("one task", () => {
		for (const c of SINGLE) it(c.name, async () => expect(await dropped(c)).toMatchSnapshot());
	});

	describe("several tasks", () => {
		for (const c of SEVERAL) it(c.name, async () => expect(await dropped(c)).toMatchSnapshot());
	});

	describe("a gap of a column, read by the sections it shows on the day", () => {
		for (const [name, place, read] of PLACES)
			for (const day of name.includes("later") ? [D] : name.includes("past") ? [P] : [T])
				it(name, async () => {
					const tasks: DropCase["tasks"] = [[name.includes("past") ? "NP2" : "S1", name.includes("past") ? "day" : "soon"]];
					expect(await dropped({ name, day, tasks, to: place })).toBe(await dropped({ name, day, tasks, to: read }));
				});
	});
});

/** The keys a drop gives against the tasks a fresh read finds by their text. */
async function landed(c: DropCase): Promise<{ given: readonly TaskKey[]; read: readonly TaskKey[] }> {
	const { svc } = setup();
	const before = await itemsOf(svc);
	const key = (text: string): TaskKey => before.get(text)!.key;
	const given = await svc.drop(c.tasks.map(([text, from]) => ({ key: key(text), from })), c.to(key), c.day);
	const after = await itemsOf(svc);
	return { given, read: c.tasks.map(([text]) => after.get(text)!.key) };
}

describe("where a drop leaves the tasks: the keys it gives are theirs as the file now has them", () => {
	for (const c of [...SINGLE, ...SEVERAL])
		it(c.name, async () => {
			const { given, read } = await landed(c);
			expect(given).toEqual(read);
		});

	it("a task carried up past a section's header into the end of the section above: the line the move kept unchanged", async () => {
		const { svc } = setup();
		const np2 = (await itemsOf(svc)).get("NP2")!;
		const n3 = (await itemsOf(svc)).get("N3")!;
		const given = await svc.drop([{ key: n3.key, from: "day" }], { kind: "group", list: "now", date: null, group: null, before: null }, T);
		expect(given).toEqual([(await itemsOf(svc)).get("N3")!.key]);
		expect(given[0].index).toBe(np2.key.index + 1);
	});
});

describe("a drop on the timeline", () => {
	const midnight = () => setup(new FakeSettingsStore({ ...DEFAULT_SETTINGS, dayStartHour: 0 }));
	const at = async (text: string, from: DropFrom, start: number, day = T) => {
		const { store, svc } = midnight();
		const item = (await itemsOf(svc)).get(text)!;
		await svc.drop([{ key: item.key, from }], { kind: "time", start }, day);
		return store.text!.split("\n").find((line) => line.includes(` ${text} `) || line.endsWith(` ${text}`));
	};

	it("a card from the timeline keeps its duration; the same task from a list gets none", async () => {
		expect(await at("N2", "timeline", 15 * 60)).toBe("- [ ] N2 ⏰ 2026-10-30 15:00-16:00");
		expect(await at("N2", "day", 15 * 60)).toBe("- [ ] N2 ⏰ 2026-10-30 15:00");
	});

	it("stands within the day: a card as long as it is, one without a duration five minutes before the end at the latest", async () => {
		expect(await at("N2", "timeline", 23 * 60 + 30)).toBe("- [ ] N2 ⏰ 2026-10-30 23:00-24:00");
		expect(await at("N1", "day", 24 * 60 + 10)).toMatch(/N1 📌 2026-10-30 23:55$/);
		expect(await at("N1", "day", -20)).toMatch(/N1 📌 2026-10-30 00:00$/);
	});

	it("dropSpan answers where the line under the finger stands, as the drop writes it", async () => {
		const { svc } = midnight();
		const n2 = (await itemsOf(svc)).get("N2")!;
		expect(svc.dropSpan(n2, "timeline", 23 * 60 + 30)).toEqual({ start: 23 * 60, end: 24 * 60 });
		expect(svc.dropSpan(n2, "day", 600)).toEqual({ start: 600, end: null });
		expect(svc.dropSpan(null, "new", 1500)).toEqual({ start: 1435, end: null });
	});
});

describe("which drops a target takes", () => {
	const ORIGINS: readonly DropOrigin[] = ["day", "soon", "inbox", "backlog", "timeline", "new"];
	const TAKES: Readonly<Record<DropColumn, readonly DropOrigin[]>> = {
		day: ["day", "soon", "inbox", "backlog", "timeline", "new"],
		soon: ["day", "soon", "inbox", "backlog", "new"],
		inbox: ["soon", "inbox", "backlog", "new"],
		backlog: ["soon", "inbox", "backlog", "new"],
	};

	for (const [column, takes] of Object.entries(TAKES) as [DropColumn, readonly DropOrigin[]][])
		it(`${column} takes a task from ${takes.join(", ")}`, () => {
			expect(ORIGINS.filter((from) => acceptsDrop(column, [from]))).toEqual(takes);
		});

	it("a list takes several only when it takes each by where it came from", () => {
		expect(acceptsDrop("inbox", ["soon", "backlog"])).toBe(true);
		expect(acceptsDrop("inbox", ["soon", "day"])).toBe(false);
		expect(acceptsDrop("soon", ["day", "inbox"])).toBe(true);
		expect(acceptsDrop("day", ["soon", "inbox", "backlog"])).toBe(true);
	});

	it("the timeline takes one task from anywhere, a new one too, never several", () => {
		for (const from of ORIGINS) expect(acceptsDrop("timeline", [from])).toBe(true);
		expect(acceptsDrop("timeline", ["day", "soon"])).toBe(false);
	});

	it("a list with sections shows a place for a task from anywhere; one without, only for its own task and a new one", () => {
		expect(placesInGap("day", "soon", true)).toBe(true);
		expect(placesInGap("day", "soon", false)).toBe(false);
		expect(placesInGap("day", "timeline", false)).toBe(false);
		expect(placesInGap("day", "day", false)).toBe(true);
		expect(placesInGap("day", "new", false)).toBe(true);
	});
});

/** The part of a list grouped by project the card `id` is drawn in, and its place among that part's section's cards; nothing in a list not grouped. */
function partOf(screen: ScreenView, column: string, id: string): { part?: unknown } {
	if (column === "done") return {};
	const grouping = screen.projects[(column === "day" ? "now" : column) as keyof ScreenView["projects"]];
	if (!grouping.on) return {};
	for (const group of grouping.groups)
		for (const section of group.sections) {
			const index = section.items.findIndex((i) => i.id === id);
			if (index >= 0) return { part: { key: group.key, zone: group.zone, section: section.name, index, folded: group.folded } };
		}
	return {};
}

/** Where the task `id` stands on the screen of `day` as read after a write, found the plain way: by looking. */
async function placeAfter(svc: Svc, id: string, day: string): Promise<unknown> {
	const screen = await svc.screen(day);
	const block = screen.day.slotted.find((i) => i.id === id);
	if (block) return { kind: "timeline", item: block, span: svc.shownSpan(block, day), slotted: screen.day.slotted.map((i) => ({ id: i.id, span: svc.shownSpan(i, day) })) };
	const columns = { day: screen.day.list, soon: screen.soon, inbox: screen.inbox, backlog: screen.backlog, done: screen.done };
	for (const [column, items] of Object.entries(columns)) {
		const card = items.find((i) => i.id === id);
		if (card) return { kind: "list", item: card, column, group: card.group, index: items.filter((i) => i.group === card.group).indexOf(card), ...partOf(screen, column, id) };
		const parent = items.flatMap(function walk(i: TaskItem): TaskItem[] {
			return [i, ...i.subtasks.flatMap(walk)];
		}).find((i) => i.subtasks.some((s) => s.id === id));
		if (parent) return { kind: "subtask", item: parent.subtasks.find((s) => s.id === id), parent: parent.id, index: parent.subtasks.findIndex((s) => s.id === id) };
	}
	return { kind: "away", item: null };
}

/**
 * `dropPreview` against the drop itself: it writes nothing, its landings are `landing`'s, and its screen and text are the
 * screen and the file the drop then gives, ids included.
 */
async function previewIsTheDrop(store: InMemoryTaskFileStore, svc: Svc, tasks: readonly DroppedTask[], to: DropTo, day: string, project?: string): Promise<void> {
	const before = store.text;
	const writes = store.writes;
	const preview = await svc.dropPreview(tasks, to, day, project);
	expect(store.text).toBe(before);
	expect(store.writes).toBe(writes);
	expect(preview.landings).toEqual(await svc.landing(tasks, to, day, project));
	await svc.drop(tasks, to, day);
	expect(preview.screen).toEqual(await svc.screen(day, project));
	expect(preview.tasks).toBe(store.text);
}

describe("dropPreview: the screen a drop leaves, before it is written", () => {
	for (const c of [...SINGLE, ...SEVERAL, { name: "today's list → a past time of today", day: T, tasks: [["N1", "day"]] as const, to: () => ({ kind: "time" as const, start: hourAt(9) }) }]) {
		it(c.name, async () => {
			const { store, svc } = setup();
			const items = await itemsOf(svc);
			const key = (text: string) => items.get(text)!.key;
			await previewIsTheDrop(store, svc, c.tasks.map(([text, from]) => ({ key: key(text), from })), c.to(key), c.day);
		});
	}
});

describe("landing: where a drop leaves a task, before it is written", () => {
	for (const c of [...SINGLE, ...SEVERAL, { name: "today's list → a past time of today: it rides the now line", day: T, tasks: [["N1", "day"]] as const, to: () => ({ kind: "time" as const, start: hourAt(9) }) }]) {
		it(`is where the write leaves it: ${c.name}`, async () => {
			const { store, svc } = setup();
			const items = await itemsOf(svc);
			const tasks = c.tasks.map(([text, from]) => ({ key: items.get(text)!.key, from }));
			const before = store.text;
			const landing = await svc.landing(tasks, c.to((text) => items.get(text)!.key), c.day);
			expect(store.text).toBe(before);
			expect(store.writes).toBe(0);
			await svc.drop(tasks, c.to((text) => items.get(text)!.key), c.day);
			const ids = c.tasks.map(([text]) => items.get(text)!.id);
			const after = await Promise.all(ids.map((id) => placeAfter(svc, id, c.day)));
			expect(landing.map(({ id: _id, ridesNow: _r, ...place }: Record<string, unknown>) => place)).toEqual(after);
			expect(landing.map((l) => l.id)).toEqual(ids);
		});
	}

	it("tells a past time of today rides the now line, and a time to come does not", async () => {
		const { svc } = setup();
		const n1 = (await itemsOf(svc)).get("N1")!;
		const [past] = await svc.landing([{ key: n1.key, from: "day" }], { kind: "time", start: hourAt(9) }, T);
		const [later] = await svc.landing([{ key: n1.key, from: "day" }], { kind: "time", start: hourAt(16) }, T);
		expect(past).toMatchObject({ kind: "timeline", ridesNow: true, span: { start: hourAt(14) + 20 } });
		expect(later).toMatchObject({ kind: "timeline", ridesNow: false, span: { start: hourAt(16) } });
	});
});

describe("landing on a column's title: where the drop leaves the task, before it is written", () => {
	const NOTES: readonly ProjectNote[] = [
		{ name: "A", path: "A.md", link: "A" },
		{ name: "B", path: "B.md", link: "B" },
	];
	const PROJECTS = ["## Inbox", "- [ ] I1", "## Now", "- [ ] N1 🗂️ [[A]]", "## Soon", "- [ ] S1 🗂️ [[A]]", "\t- [ ] S1a", "- [ ] S2 🗂️ [[B]]", "- [ ] S3", "## Backlog", "- [ ] BA1 🗂️ [[A]]", "- [ ] BB1 🗂️ [[B]]", "- [ ] BN", "### Later", "- [ ] BA3 🗂️ [[A]]", "## Done", ""].join("\n");

	/** The plain file of this suite, or one of projects with Soon and Backlog grouped by project. */
	function service(byProject: boolean) {
		if (!byProject) return setup();
		const store = new InMemoryTaskFileStore(PROJECTS);
		const projects = { list: () => NOTES, onChange: () => () => undefined };
		return { store, svc: new TaskServiceImpl(store, new FakeSettingsStore(), clock, null, projects, memoryGrouping()) };
	}

	interface TitleCase {
		readonly name: string;
		readonly byProject: boolean;
		readonly day: string;
		readonly column: DropColumn;
		readonly tasks: readonly (readonly [string, DropFrom])[];
	}

	const CASES: readonly TitleCase[] = [
		{ name: "Soon → today's title", byProject: false, day: T, column: "day", tasks: [["S1", "soon"]] },
		{ name: "Inbox → a later day's title", byProject: false, day: D, column: "day", tasks: [["I1", "inbox"]] },
		{ name: "the timeline → today's title", byProject: false, day: T, column: "day", tasks: [["N2", "timeline"]] },
		{ name: "today's list → Soon's title", byProject: false, day: T, column: "soon", tasks: [["N1", "day"]] },
		{ name: "Backlog → Inbox's title", byProject: false, day: T, column: "inbox", tasks: [["B2", "backlog"]] },
		{ name: "Inbox → Backlog's title", byProject: false, day: T, column: "backlog", tasks: [["I1", "inbox"]] },
		{ name: "several → Backlog's title", byProject: false, day: T, column: "backlog", tasks: [["I1", "inbox"], ["S2", "soon"]] },
		{ name: "Inbox → Backlog's title grouped by project", byProject: true, day: T, column: "backlog", tasks: [["I1", "inbox"]] },
		{ name: "a project's task → Backlog's title grouped by project: to its project's part", byProject: true, day: T, column: "backlog", tasks: [["S2", "soon"]] },
		{ name: "Backlog → Soon's title grouped by project", byProject: true, day: T, column: "soon", tasks: [["BA1", "backlog"], ["BN", "backlog"]] },
		{ name: "a project's task → today's title", byProject: true, day: T, column: "day", tasks: [["BB1", "backlog"]] },
		{ name: "a project's task → Inbox's title", byProject: true, day: T, column: "inbox", tasks: [["S1", "soon"]] },
	];

	for (const c of CASES) {
		it(`is where the write leaves it: ${c.name}`, async () => {
			const { store, svc } = service(c.byProject);
			if (c.byProject) await svc.setGrouping("soon", true);
			const screen = await svc.screen(c.day);
			const items = await itemsOf(svc);
			const byText = (text: string) => items.get(text) ?? [...screen.inbox, ...screen.backlog, ...screen.soon, ...screen.day.list, ...screen.day.slotted].find((i) => i.text === text || i.title === text)!;
			const to = screen.titleDrops[c.column];
			expect(to.kind).toBe("title");
			const tasks = c.tasks.map(([text, from]) => ({ key: byText(text).key, from }));
			const before = store.text;
			const landing = await svc.landing(tasks, to, c.day);
			expect(store.text).toBe(before);
			await svc.drop(tasks, to, c.day);
			const ids = c.tasks.map(([text]) => byText(text).id);
			const after = await Promise.all(ids.map((id) => placeAfter(svc, id, c.day)));
			expect(landing.map(({ id: _id, ridesNow: _r, ...place }: Record<string, unknown>) => place)).toEqual(after);
			expect(landing.map((l) => l.id)).toEqual(ids);
			expect(landing.every((l) => l.kind !== "away")).toBe(true);
		});

		it(`dropPreview gives the screen the drop leaves: ${c.name}`, async () => {
			const { store, svc } = service(c.byProject);
			if (c.byProject) await svc.setGrouping("soon", true);
			const screen = await svc.screen(c.day);
			const items = await itemsOf(svc);
			const byText = (text: string) => items.get(text) ?? [...screen.inbox, ...screen.backlog, ...screen.soon, ...screen.day.list, ...screen.day.slotted].find((i) => i.text === text || i.title === text)!;
			await previewIsTheDrop(store, svc, c.tasks.map(([text, from]) => ({ key: byText(text).key, from })), screen.titleDrops[c.column], c.day);
		});
	}

	it("dropPreview in a project's own view gives that view after the drop", async () => {
		const { store, svc } = service(true);
		const screen = await svc.screen(T, "A");
		const s1 = screen.soon.find((i) => i.title === "S1")!;
		await previewIsTheDrop(store, svc, [{ key: s1.key, from: "soon" }], screen.titleDrops.backlog, T, "A");
	});
});

describe("landing in a list grouped by project: the part the screen draws, and the place in it", () => {
	const NOTES: readonly ProjectNote[] = [
		{ name: "X", path: "X.md", link: "X" },
		{ name: "Y", path: "Y.md", link: "Y" },
	];
	const GROUPED = ["## Inbox", "- [ ] E 🗂️ [[X]]", "- [ ] F", "## Now", "## Soon", "- [ ] B 🗂️ [[Y]]", "- [ ] A 🗂️ [[X]]", "- [ ] N", "### Later", "- [ ] L 🗂️ [[X]]", "## Backlog", "- [ ] BY 🗂️ [[Y]]", "- [ ] BN", "- [ ] BX 🗂️ [[X]]", "## Done", ""].join("\n");

	async function grouped() {
		const store = new InMemoryTaskFileStore(GROUPED);
		const projects = { list: () => NOTES, onChange: () => () => undefined };
		const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, null, projects, memoryGrouping());
		await svc.setGrouping("soon", true);
		await svc.setGrouping("backlog", true);
		return { store, svc };
	}

	const CASES: readonly { name: string; text: string; from: DropFrom; to: (key: (text: string) => TaskKey, screen: ScreenView) => DropTo; part: { key: string; index: number } }[] = [
		{ name: "Soon, before the first of project X, behind Y's in the file", text: "E", from: "inbox", to: (key) => ({ kind: "place", column: "soon", place: { kind: "task", group: null, before: key("A"), project: "X" } }), part: { key: "x", index: 0 } },
		{ name: "Soon, at the end of project X", text: "E", from: "inbox", to: () => ({ kind: "place", column: "soon", place: { kind: "task", group: null, before: null, project: "X" } }), part: { key: "x", index: 1 } },
		{ name: "Soon, into no project", text: "F", from: "inbox", to: () => ({ kind: "place", column: "soon", place: { kind: "task", group: null, before: null, project: null } }), part: { key: "", index: 1 } },
		{ name: "Soon's title: to its own project's part", text: "E", from: "inbox", to: (_key, screen) => screen.titleDrops.soon, part: { key: "x", index: 1 } },
		{ name: "Backlog, before X's task, behind no project's in the file", text: "E", from: "inbox", to: (key) => ({ kind: "place", column: "backlog", place: { kind: "task", group: null, before: key("BX"), project: "X" } }), part: { key: "x", index: 0 } },
		{ name: "Backlog's title: no project", text: "F", from: "inbox", to: (_key, screen) => screen.titleDrops.backlog, part: { key: "", index: 1 } },
		{ name: "Backlog's title: project Y", text: "B", from: "soon", to: (_key, screen) => screen.titleDrops.backlog, part: { key: "y", index: 1 } },
	];

	for (const c of CASES) {
		it(`is where the write leaves it: ${c.name}`, async () => {
			const { store, svc } = await grouped();
			const screen = await svc.screen(T);
			const all = [...screen.inbox, ...screen.soon, ...screen.backlog];
			const key = (text: string) => all.find((i) => i.text === text)!.key;
			const task = all.find((i) => i.text === c.text)!;
			const to = c.to(key, screen);
			const before = store.text;
			const [landing] = await svc.landing([{ key: task.key, from: c.from }], to, T);
			expect(store.text).toBe(before);
			expect(landing).toMatchObject({ kind: "list", id: task.id, part: c.part });
			await svc.drop([{ key: task.key, from: c.from }], to, T);
			const { id: _id, ridesNow: _r, ...place } = landing as unknown as Record<string, unknown>;
			expect(place).toEqual(await placeAfter(svc, task.id, T));
		});

		it(`dropPreview gives the screen the drop leaves: ${c.name}`, async () => {
			const { store, svc } = await grouped();
			const screen = await svc.screen(T);
			const all = [...screen.inbox, ...screen.soon, ...screen.backlog];
			const task = all.find((i) => i.text === c.text)!;
			await previewIsTheDrop(store, svc, [{ key: task.key, from: c.from }], c.to((text) => all.find((i) => i.text === text)!.key, screen), T);
		});
	}

	for (const [name, column, text, from, to] of [
		["Soon's folded part X, at its header", "soon", "E", "inbox", (s: ScreenView) => ({ kind: "place", column: "soon", place: { kind: "task", group: null, before: null, project: "X" } }) as DropTo],
		["Soon's title, the task's own part X folded", "soon", "E", "inbox", (s: ScreenView) => s.titleDrops.soon],
		["Backlog's title, the task's own part X folded", "backlog", "E", "inbox", (s: ScreenView) => s.titleDrops.backlog],
	] as const) {
		it(`names a folded part, its card not drawn: ${name}`, async () => {
			const { store, svc } = await grouped();
			await svc.toggleFold(column, "x");
			const screen = await svc.screen(T);
			const group = screen.projects[column].groups.find((g) => g.key === "x")!;
			expect(group.folded).toBe(true);
			const task = [...screen.inbox, ...screen.soon, ...screen.backlog].find((i) => i.text === text)!;
			const before = store.text;
			const [landing] = await svc.landing([{ key: task.key, from }], to(screen), T);
			expect(store.text).toBe(before);
			expect(landing).toMatchObject({ kind: "list", column, part: { key: "x", zone: "X", folded: true } });
			await svc.drop([{ key: task.key, from }], to(screen), T);
			const after = (await svc.screen(T)).projects[column].groups.find((g) => g.key === "x")!;
			expect(after.folded).toBe(true);
			expect(after.sections.some((sec) => sec.items.some((i) => i.id === task.id))).toBe(true);
		});
	}

	it("says an open part is not folded", async () => {
		const { svc } = await grouped();
		const screen = await svc.screen(T);
		const task = screen.inbox.find((i) => i.text === "E")!;
		const [landing] = await svc.landing([{ key: task.key, from: "inbox" }], screen.titleDrops.soon, T);
		expect(landing).toMatchObject({ kind: "list", part: { key: "x", folded: false } });
	});

	it("gives no part in a list not grouped", async () => {
		const { svc } = setup();
		const items = await itemsOf(svc);
		const [landing] = await svc.landing([{ key: items.get("I1")!.key, from: "inbox" }], { kind: "list", column: "soon", before: null }, T);
		expect(landing.kind).toBe("list");
		expect("part" in landing).toBe(false);
	});
});
