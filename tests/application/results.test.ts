import { describe, expect, it } from "vitest";
import type { MenuScreen, ProjectNote, ScreenView, TaskItem } from "../../core/application/contracts";
import { memoryGrouping, type Clock } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-11-11";
const clock: Clock = { now: () => new Date(2026, 10, 11, 14, 0) };
const NOTES: readonly ProjectNote[] = [{ name: "Окружение в Сербии", path: "Окружение в Сербии.md", link: "Окружение в Сербии" }];

const FILE = [
	"## Inbox",
	"- [ ] Call bank",
	"\t- [ ] Find number",
	"## Now",
	"- [ ] 🎯 p1 Компания в Белграде 📁 🗂️ [[Окружение в Сербии]] 📅 2026-11-11",
	"\t- [x] Meet Ana",
	"\t- [ ] Write to Marko",
	"\t\t- [x] Find his mail",
	"\t\t- [ ] Draft the letter",
	"\t- [ ] Book a table",
	"- [ ] 🎯 Unfolded 📅 2026-11-11",
	"\t- [ ] Step one",
	"- [ ] 🎯 Bare 📅 2026-11-11",
	"\t- [x] Done step",
	"- [ ] Lunch ⏰ 2026-11-11 13:00-14:00",
	"## Soon",
	"- [ ] 🎯 Ёлка ⏰ 2026-11-12 10:00",
	"\t- [ ] Buy lights",
	"## Backlog",
	"- [ ] Someday",
	"\t- [ ] 🎯 Inner goal",
	"\t\t- [ ] Inner step",
	"## Done",
	"- [x] 🎯 Old goal",
	"",
].join("\n");

function setup(text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const history = new UndoHistory(store);
	const projects = { list: () => NOTES, onChange: () => () => undefined };
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, history, projects, memoryGrouping());
	return { store, svc, history };
}

const flat = (items: readonly TaskItem[]): TaskItem[] => items.flatMap((i) => [i, ...flat(i.allSubtasks)]);
const all = (s: ScreenView): TaskItem[] => flat([...s.inbox, ...s.day.list, ...s.day.slotted, ...s.soon, ...s.backlog, ...s.done]);
function named(s: ScreenView, title: string): TaskItem {
	const item = all(s).find((i) => i.title === title);
	if (!item) throw new Error(`no ${title}`);
	return item;
}
const menuScreen = (s: ScreenView): MenuScreen => ({ today: T, day: T, offer: s.offer });

describe("a result's card", () => {
	it("folded with an open step: the step on top, the result's own title small over it, the step's menu on a tap", async () => {
		const { svc } = setup();
		const s = await svc.screen(T);
		const result = named(s, "Компания в Белграде");
		expect(result.isResult).toBe(true);
		expect(result.card).toMatchObject({ text: "Draft the letter", title: "Draft the letter", over: "Компания в Белграде", semibold: false });
		expect(result.card.step!.key).toEqual(named(s, "Draft the letter").key);
		expect(result.card.step!.id).toBe(named(s, "Draft the letter").id);
		expect([result.priority?.prefix, result.project?.name, result.progress]).toEqual(["p1", "Окружение в Сербии", { done: 1, total: 3 }]);
	});

	it("Done on the step makes the next open step the card's title", async () => {
		const { svc } = setup();
		const s = await svc.screen(T);
		await svc.setStatus(named(s, "Компания в Белграде").card.step!.key, "done");
		expect(named(await svc.screen(T), "Компания в Белграде").card.text).toBe("Write to Marko");
		await svc.setStatus(named(await svc.screen(T), "Компания в Белграде").card.step!.key, "done");
		expect(named(await svc.screen(T), "Компания в Белграде").card.text).toBe("Book a table");
	});

	it("unfolded: its own title in semibold, one line; the timeline's block still shows the step", async () => {
		const { svc } = setup();
		const result = named(await svc.screen(T), "Unfolded");
		expect(result.card).toEqual({ text: "Unfolded", title: "Unfolded", over: null, step: null, semibold: true });
		expect(result.block.text).toBe("Step one");
		expect(result.block.step!.title).toBe("Step one");
	});

	it("with no open step: its own title, semibold, its own menu", async () => {
		const { svc } = setup();
		const result = named(await svc.screen(T), "Bare");
		expect(result.card).toEqual({ text: "Bare", title: "Bare", over: null, step: null, semibold: true });
		expect(result.block).toEqual({ text: "Bare", title: "Bare", step: null });
	});

	it("a plain task's card and block are its own title", async () => {
		const { svc } = setup();
		const lunch = named(await svc.screen(T), "Lunch");
		expect(lunch.card).toEqual({ text: "Lunch", title: "Lunch", over: null, step: null, semibold: false });
		expect(lunch.block).toEqual({ text: "Lunch", title: "Lunch", step: null });
	});

	it("on the timeline: a slotted result's block is its next step", async () => {
		const { svc } = setup();
		const slotted = (await svc.screen("2026-11-12")).day.slotted.find((i) => i.isResult)!;
		expect(slotted.block.text).toBe("Buy lights");
	});

	it("a closed result shows its own title", async () => {
		const { svc } = setup();
		expect(named(await svc.screen(T), "Old goal").card).toMatchObject({ text: "Old goal", over: null, step: null });
	});

	it("every step knows the result it is the nearest step of", async () => {
		const { svc } = setup();
		const s = await svc.screen(T);
		expect(named(s, "Draft the letter").resultOf).toMatchObject({ title: "Компания в Белграде", id: named(s, "Компания в Белграде").id });
		expect(named(s, "Inner step").resultOf!.title).toBe("Inner goal");
		expect(named(s, "Inner goal").resultOf).toBeNull();
		expect(named(s, "Lunch").resultOf).toBeNull();
	});

	it("the full screen draws every row with its own title", async () => {
		const { svc } = setup();
		const tree = svc.fullTree(named(await svc.screen(T), "Компания в Белграде"));
		expect(tree.rows.every((row) => row.item.card.over === null && row.item.card.text === row.item.text)).toBe(true);
	});

	it("search finds a result by its title, without the mark, and a found step knows its result", async () => {
		const { svc } = setup();
		const groups = await svc.search("draft");
		const hit = groups.flatMap((g) => g.hits).find((h) => h.item.title === "Draft the letter")!;
		expect(hit.item.resultOf!.title).toBe("Компания в Белграде");
		const goal = (await svc.search("компания")).flatMap((g) => g.hits)[0];
		expect(goal.item.text).toBe("Компания в Белграде");
	});
});

describe("the menu's result rows", () => {
	it("one open task: Add to result and Make result; its result, if any, beside Add to result", async () => {
		const { svc } = setup();
		const s = await svc.screen(T);
		expect(svc.menu(named(s, "Lunch"), "day", menuScreen(s)).result).toEqual({ rows: ["addToResult", "toggle"], label: "Add to result", value: "", current: null, toggle: { label: "Make result", result: true } });
		const step = svc.menu(named(s, "Draft the letter"), "day", menuScreen(s)).result;
		expect([step.value, step.current?.title]).toEqual(["Компания в Белграде", "Компания в Белграде"]);
	});

	it("a result reads Make task", async () => {
		const { svc } = setup();
		const s = await svc.screen(T);
		expect(svc.menu(named(s, "Bare"), "day", menuScreen(s)).result.toggle).toEqual({ label: "Make task", result: false });
	});

	it("a closed task has none; the bulk menu of open tasks Add to result alone", async () => {
		const { svc } = setup();
		const s = await svc.screen(T);
		expect(svc.menu(named(s, "Old goal"), "done", menuScreen(s)).result.rows).toEqual([]);
		const picked = [named(s, "Lunch"), named(s, "Someday")].map((item) => ({ item, from: "day" as const }));
		expect(svc.bulkMenu(picked, menuScreen(s)).result.rows).toEqual(["addToResult"]);
	});
});

describe("the Add to result page", () => {
	it("offers every open result in file order with its place and project, ticking the task's own", async () => {
		const { svc } = setup();
		const s = await svc.screen(T);
		const page = await svc.resultPage([named(s, "Draft the letter").key], "");
		expect(page.options.map((o) => [o.result.title, o.list, o.project, o.checked])).toEqual([
			["Компания в Белграде", "now", "Окружение в Сербии", true],
			["Unfolded", "now", null, false],
			["Bare", "now", null, false],
			["Ёлка", "soon", null, false],
			["Inner goal", "backlog", null, false],
		]);
		expect([page.placeholder, page.newLabel, page.namePlaceholder]).toEqual(["Search results", "New result…", "Result name"]);
	});

	it("leaves out the task itself and the results inside it", async () => {
		const { svc } = setup();
		const s = await svc.screen(T);
		const page = await svc.resultPage([named(s, "Someday").key, named(s, "Bare").key], "");
		expect(page.options.map((o) => o.result.title)).toEqual(["Компания в Белграде", "Unfolded", "Ёлка"]);
	});

	it("filters by the title typed, case and accents aside", async () => {
		const { svc } = setup();
		const s = await svc.screen(T);
		expect((await svc.resultPage([named(s, "Lunch").key], "  ЕЛ ")).options.map((o) => o.result.title)).toEqual(["Компания в Белграде", "Ёлка"]);
		expect((await svc.resultPage([named(s, "Lunch").key], "nothing")).options).toEqual([]);
	});
});

describe("the writes", () => {
	it("Make result marks the line and folds it, one undo step; Make task takes the mark off", async () => {
		const { svc, store, history } = setup("## Now\n- [ ] Trip 📅 2026-11-11\n\t- [ ] Seats\n## Done\n");
		await svc.setResult(named(await svc.screen(T), "Trip").key, true);
		expect(store.text).toContain("- [ ] 🎯 Trip 📁 📅 2026-11-11\n");
		await svc.setResult(named(await svc.screen(T), "Trip").key, false);
		expect(store.text).toContain("- [ ] Trip 📁 📅 2026-11-11\n");
		await history.undo();
		expect(store.text).toContain("- [ ] 🎯 Trip 📁 📅 2026-11-11\n");
	});

	it("Add to result moves the tasks with their subtasks into the result, folded; one undo step takes it back", async () => {
		const { svc, store, history } = setup();
		const s = await svc.screen(T);
		const before = store.text;
		await svc.addToResult([named(s, "Call bank").key, named(s, "Lunch").key], named(s, "Bare").key);
		expect(store.text).toContain(["- [ ] 🎯 Bare 📁 📅 2026-11-11", "\t- [x] Done step", "\t- [ ] Call bank", "\t\t- [ ] Find number", "\t- [ ] Lunch ⏰ 2026-11-11 13:00-14:00"].join("\n"));
		const bare = named(await svc.screen(T), "Bare");
		expect(bare.card.text).toBe("Find number");
		await history.undo();
		expect(store.text).toBe(before);
	});

	it("Add to result to the result the task is in writes nothing; to a task no longer a result is stale", async () => {
		const { svc, store } = setup();
		const s = await svc.screen(T);
		const before = store.text;
		await svc.addToResult([named(s, "Draft the letter").key], named(s, "Компания в Белграде").key);
		expect(store.text).toBe(before);
		await expect(svc.addToResult([named(s, "Lunch").key], named(s, "Someday").key)).rejects.toMatchObject({ code: "staleTask" });
	});

	it("New result… writes a result at the task's place with it as the step, and answers the result", async () => {
		const { svc, store, history } = setup();
		const s = await svc.screen(T);
		const made = await svc.newResult([named(s, "Lunch").key], "Health");
		expect(store.text).toContain("- [ ] 🎯 Health 📁\n\t- [ ] Lunch ⏰ 2026-11-11 13:00-14:00\n## Soon");
		const result = named(await svc.screen(T), "Health");
		expect(made).toEqual({ key: result.key, id: result.id });
		expect(result.card).toMatchObject({ text: "Lunch", over: "Health" });
		expect(history.canUndo()).toBe(true);
	});

	it("New result… with a blank name, or the mark alone, writes nothing", async () => {
		const { svc, store } = setup();
		const s = await svc.screen(T);
		const before = store.text;
		expect(await svc.newResult([named(s, "Lunch").key], "   ")).toBeNull();
		expect(await svc.newResult([named(s, "Lunch").key], "🎯 ")).toBeNull();
		expect(store.text).toBe(before);
		expect(svc.isBlank("🎯 p1 ")).toBe(true);
	});

	it("a rename keeps the result and its field never shows the mark", async () => {
		const { svc, store } = setup();
		const result = named(await svc.screen(T), "Bare");
		expect(result.text).toBe("Bare");
		await svc.rename(result.key, "Bare goal");
		expect(store.text).toContain("- [ ] 🎯 Bare goal 📅 2026-11-11\n");
	});
});
