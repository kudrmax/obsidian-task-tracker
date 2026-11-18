import { describe, expect, it } from "vitest";
import { composeCore } from "../../../core/application/composeCore";
import { SourceProblemError } from "../../../core/application/EventSource";
import type { CalendarSource } from "../../../core/application/contracts";
import { createScreenStore, type ScreenStore } from "../../../obsidian/ui/engine/screenStore";
import { ShownSettingsStore, ViewSettingsStore, type ViewSettings } from "../../../obsidian/ui/viewSettings";
import { ScreenSettingsImpl } from "../../../core/application/ScreenSettingsImpl";
import { FixedClock } from "../../fakes/DemoClock";
import { FakeSettingsStore } from "../../fakes/FakeSettingsStore";
import { FakeTimers } from "../../fakes/FakeTimers";
import { InMemoryTaskFileStore } from "../../fakes/InMemoryTaskFileStore";

const NOW = new Date(2026, 10, 17, 14, 0);
const TODAY = "2026-11-17";

const FILE = `## Inbox
- [ ] Первая во входящих
- [ ] p1 Вторая во входящих

## Now
- [ ] Сегодняшняя 📅 ${TODAY}
- [ ] С шагами 📅 ${TODAY}
	- [ ] Шаг один
	- [ ] Шаг два
- [ ] На время 📅 ${TODAY} 📌 ${TODAY} 16:00-17:00

## Soon
- [ ] Когда-нибудь
- [ ] Завтрашняя 📅 2026-11-18

### Пустая

## Backlog
- [ ] В бэклоге

## Done
- [x] Сделанная
`;

const missingFile = (name: CalendarSource) => ({
	name,
	read: () => Promise.reject(new SourceProblemError({ kind: "fileMissing" }, "missing")),
	onChange: () => () => undefined,
});

/** The real core over a file in memory, and the screen's store over it, as the plugin composes them. */
function setup(text: string | null = FILE) {
	const file = new InMemoryTaskFileStore(text);
	const settings = new FakeSettingsStore();
	const core = composeCore({
		tasksFile: file,
		settings,
		clock: new FixedClock(NOW),
		ticker: { every: () => () => undefined },
		timers: new FakeTimers(),
		calendarFiles: { google: missingFile("google"), iphone: missingFile("iphone"), work: missingFile("work") },
		feeds: [],
		work: { export: async () => undefined },
		isPhone: () => false,
	});
	let view: Partial<ViewSettings> = {};
	const viewFile = { get: () => view as ViewSettings, update: async (patch: Partial<ViewSettings>) => void (view = { ...view, ...patch }), onChange: () => () => undefined };
	const shown = new ShownSettingsStore(new ScreenSettingsImpl(settings), new ViewSettingsStore(viewFile));
	const store = createScreenStore({ ...core, settings: shown, clock: new FixedClock(NOW) }, { kind: "main" }, () => true);
	return { store, file, core };
}

const titlesOf = (store: ScreenStore, column: "inbox" | "backlog" | "soon" | "day") => {
	const s = store.getState();
	return s.columns[column].groups.flatMap((group) => group.rows.map((row) => s.items[row.id].card.title));
};

describe("the screen's store", () => {
	it("reads every list of the funnel in file order, the day's from the core", async () => {
		const { store } = setup();
		await store.getState().refresh();
		const s = store.getState();
		expect(s.phase).toBe("ready");
		expect(titlesOf(store, "inbox")).toEqual(["Первая во входящих", "Вторая во входящих"]);
		expect(titlesOf(store, "backlog")).toEqual(["В бэклоге"]);
		expect(titlesOf(store, "soon")).toEqual(["Когда-нибудь"]);
		expect(titlesOf(store, "day")).toEqual(["Сегодняшняя", "С шагами", "Шаг один", "Шаг два"]);
		expect(s.slotted.map((id) => s.items[id].card.title)).toEqual(["На время"]);
		expect(s.dayTitle).toBe("Today");
	});

	it("draws a subtask a level in, with its branch from the core", async () => {
		const { store } = setup();
		await store.getState().refresh();
		const rows = store.getState().columns.day.groups.flatMap((group) => group.rows);
		expect(rows.map((row) => [row.level, row.branch?.last ?? null])).toEqual([
			[0, null],
			[0, null],
			[1, false],
			[1, true],
		]);
	});

	it("shows an empty section with its plate in the list that holds it", async () => {
		const { store } = setup();
		await store.getState().refresh();
		const soon = store.getState().columns.soon.groups;
		expect(soon.map((group) => [group.name, group.header, group.empty])).toEqual([
			[null, true, false],
			["Пустая", true, true],
		]);
	});

	it("keeps the objects of what a write left alone, so only the changed card and its list draw again", async () => {
		const { store, core } = setup();
		await store.getState().refresh();
		const before = store.getState();
		const first = before.columns.inbox.groups[0].rows[0].id;
		const second = before.columns.inbox.groups[0].rows[1].id;
		await core.tasks.setPriority(before.items[first].key, "p1");
		await store.getState().refresh();
		const after = store.getState();
		expect(after.items[first]).not.toBe(before.items[first]);
		expect(after.items[second]).toBe(before.items[second]);
		expect(after.columns.inbox).toBe(before.columns.inbox);
		expect(after.columns.soon).toBe(before.columns.soon);
		expect(after.columns.day).toBe(before.columns.day);
	});

	it("follows a change of the file made elsewhere", async () => {
		const { store, file } = setup();
		await store.getState().refresh();
		file.text = FILE.replace("- [ ] В бэклоге", "- [ ] В бэклоге\n- [ ] Дописанная руками");
		file.emitChange();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(titlesOf(store, "backlog")).toEqual(["В бэклоге", "Дописанная руками"]);
	});

	it("walks the ribbon's places, then the days after today at the calendar", async () => {
		const { store } = setup();
		await store.getState().refresh();
		store.getState().setPlace("inbox");
		expect(store.getState().step(-1)).toBe(false);
		expect(store.getState().step(1)).toBe(true);
		expect(store.getState().place).toBe("soon");
		store.getState().step(1);
		expect(store.getState().place).toBe("calendar");
		store.getState().step(1);
		expect(store.getState().place).toBe("calendar");
		expect(store.getState().date).toBe("2026-11-18");
		expect(store.getState().dayTitle).toBe("Tomorrow");
		store.getState().toToday();
		expect(store.getState().date).toBe(TODAY);
	});

	it("offers to create a missing file, and reads the new one", async () => {
		const { store } = setup(null);
		await store.getState().refresh();
		expect(store.getState().phase).toBe("missing");
		await store.getState().createFile();
		expect(store.getState().phase).toBe("ready");
	});
});

describe("the screen's store by project", () => {
	const PROJECTS = `## Inbox
- [ ] Своя задача дома 🗂️ Дом
- [ ] Ремонт крана 🗂️ Кухня
- [ ] Без проекта

## Projects
- Дом
	- Кухня

## Now

## Soon
- [ ] Позже дома 🗂️ Дом 📅 2026-11-20

## Backlog

## Done
`;

	it("draws the node's tasks by project: its own part first, a part per subproject, each card with its stage", async () => {
		const { store, core } = setup(PROJECTS);
		await core.tasks.setViewMode("byProject");
		await core.tasks.pickProjectNode("project:Дом", true);
		await store.getState().refresh();
		const s = store.getState();
		const groups = s.columns.projects.groups.map((group) => ({ title: group.title ?? null, header: group.header, rows: group.rows.map((row) => [s.items[row.id].card.title, row.stage?.kind ?? null]) }));
		expect(groups).toEqual([
			{ title: null, header: false, rows: [["Своя задача дома", "inbox"], ["Позже дома", "date"]] },
			{ title: "Кухня", header: true, rows: [["Ремонт крана", "inbox"]] },
		]);
	});
});
