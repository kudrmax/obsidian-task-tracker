import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TaskItem, TaskService } from "../../core/application/contracts";
import { memoryCore } from "../../obsidian/memoryCore";
import type { CorePort } from "../../obsidian/adapters/CorePort";
import type { Destination, ScreenData } from "../../obsidian/ui/engine/port";
import { TASKS as AGENT_TASKS } from "../agent/vault";
import { corePortOver, NOW, standText } from "./standCore";

/**
 * Max's data stays as it is (the plan's step 5, «Max's data»): a tasks file read through `CorePort` and drawn, every day
 * and menu of it, is written back byte for byte as the old screen's path leaves it; and each write the engine makes lands
 * in the file exactly as the old screen's call of the same service does. A copy of Max's own file is checked too when
 * `TC_ROUND_TRIP_FILE` names one (never his vault itself).
 */

interface Case {
	readonly name: string;
	readonly text: string;
	readonly now: Date;
	/** Written by the stand, not by the core: the core's own tidy text of it is the file compared byte for byte. */
	readonly tidy?: boolean;
}

const CASES: Case[] = [
	{ name: "the stand's made-up file", text: standText(NOW), now: NOW, tidy: true },
	{ name: "the agents' fixture file", text: AGENT_TASKS, now: new Date(2026, 10, 18, 13, 5) },
	...(process.env.TC_ROUND_TRIP_FILE ? [{ name: "a copy of Max's tasks file", text: readFileSync(process.env.TC_ROUND_TRIP_FILE, "utf8"), now: new Date() }] : []),
];

/** The old screen's path: the service read as it opens the screen, nothing done. */
async function oldPathText(text: string, now: Date): Promise<string | null> {
	const { core, file } = memoryCore(text, { now: () => now });
	await core.tasks.screen(core.days.today());
	return file.text;
}

/** The first task of each list's first section and where it stands: the card it goes before in its section, its section. */
function homes(data: ScreenData): { readonly id: string; readonly home: Destination }[] {
	return (["inbox", "soon", "day"] as const).flatMap((list) => {
		const rows = data.lists[list].rows;
		const at = rows.findIndex((row) => row.kind === "task" && row.depth === 0);
		if (at < 0) return [];
		const header = rows.slice(0, at).reverse().find((row) => row.kind === "section");
		const after = rows.slice(at + 1);
		const end = after.findIndex((row) => row.kind === "section");
		const next = (end < 0 ? after : after.slice(0, end)).find((row) => row.kind === "task" && row.depth === 0);
		return [{ id: rows[at].id, home: { list, before: next?.id ?? null, dayOffset: 0, depth: 0, section: header?.id ?? null } }];
	});
}

function drawAll(port: CorePort, data: ScreenData, dayOffset: number): void {
	for (const list of ["inbox", "soon", "day"] as const) for (const row of data.lists[list].rows) if (row.kind === "task") port.menu(row.id, "list", dayOffset);
	for (const block of data.day.blocks) port.menu(block.id, "calendar", dayOffset);
}

describe.each(CASES)("$name through CorePort", ({ text: given, now, tidy }) => {
	it("read, drawn on every day of a fortnight with every menu, is written back byte for byte as it was", async () => {
		const text = tidy ? ((await oldPathText(given, now)) ?? "") : given;
		const { port, file } = await corePortOver(text, now);
		for (let day = -7; day <= 7; day++) drawAll(port, port.read(day), day);
		expect(file.text === text).toBe(true);
	});

	it("read and drawn, is written back as the old screen leaves it", async () => {
		const { port, file } = await corePortOver(given, now);
		for (let day = -7; day <= 7; day++) drawAll(port, port.read(day), day);
		expect(file.text).toBe(await oldPathText(given, now));
	});

	it("a card let go where it was lifted writes nothing", async () => {
		const { port, file } = await corePortOver(given, now);
		const before = file.text;
		for (const { id, home } of homes(port.read(0))) await port.move(id, home);
		expect(file.text).toBe(before);
	});

	it("a rename left as it was writes what the old screen's rename writes: the service's edit of the same draft", async () => {
		const { port, file } = await corePortOver(given, now);
		const old = memoryCore(given, { now: () => now });
		await old.core.tasks.screen(old.core.days.today());
		for (const { id } of homes(port.read(0))) {
			const title = port.read(0).cards[id].title;
			const rename = port.rename(id, "list", 0);
			await port.commit(rename.field, rename.text, rename.draft, false).write;
			const item = (await old.core.tasks.openTasks()).find((t) => t.item.title === title)!.item;
			await old.core.tasks.edit(item.key, { text: item.text, placement: old.core.tasks.placementOf(item), priority: item.priority?.prefix ?? null });
		}
		expect(file.text).toBe(old.file.text);
	});
});

/** The same file in two cores: one written through `CorePort`, one through the services as the old screen calls them. */
async function pair(text = standText(NOW)) {
	const engine = await corePortOver(text, NOW);
	const old = memoryCore(text, { now: () => NOW });
	await old.core.tasks.screen(old.core.days.today());
	const item = async (tasks: TaskService, title: string): Promise<TaskItem> => {
		const found = (await tasks.openTasks()).find((t) => t.item.title === title);
		if (!found) throw new Error(`no «${title}»`);
		return found.item;
	};
	const idOf = (title: string): string => {
		for (let day = 0; day <= 1; day++) {
			const data = engine.port.read(day);
			const id = Object.keys(data.cards).find((key) => data.cards[key].title === title);
			if (id) return id;
		}
		throw new Error(`no card «${title}»`);
	};
	return { engine, old, idOf, oldItem: (title: string) => item(old.core.tasks, title) };
}

/** The stand's titles: `n` is a task's place in the made-up file (`mockData`'s `title`). */
const INBOX_FIRST = "Написать документы 1";
const INBOX_SECOND = "Купить квартиру 2";
const TIMED = "Длинный блок на два часа";

describe("each write the engine makes lands as the old screen's call of the same service", () => {
	it("a card to the end of Soon: the end of Soon's last section", async () => {
		const { engine, old, idOf, oldItem } = await pair();
		await engine.port.move(idOf(INBOX_FIRST), { list: "soon", before: null, dayOffset: 0, depth: 0 });
		const sections = (await old.core.tasks.screen(old.core.days.today())).sections.soon;
		await old.core.tasks.moveToGroup((await oldItem(INBOX_FIRST)).key, "soon", sections[sections.length - 1].name, null);
		expect(engine.file.text).toBe(old.file.text);
	});

	it("a card before another of its list, and a level in under the card above", async () => {
		const { engine, old, idOf, oldItem } = await pair();
		await engine.port.move(idOf(INBOX_SECOND), { list: "inbox", before: idOf(INBOX_FIRST), dayOffset: 0, depth: 0 });
		await old.core.tasks.moveBefore((await oldItem(INBOX_SECOND)).key, (await oldItem(INBOX_FIRST)).key, old.core.days.today());
		expect(engine.file.text).toBe(old.file.text);
		await engine.port.move(idOf(INBOX_SECOND), { list: "inbox", before: null, dayOffset: 0, depth: 0, section: null });
		const second = await oldItem(INBOX_SECOND);
		await old.core.tasks.moveToGroup(second.key, "inbox", null, null);
		expect(engine.file.text).toBe(old.file.text);
		const last = engine.port.read(0).lists.inbox.rows.filter((row) => row.kind === "task").slice(-1)[0];
		const lastTitle = engine.port.read(0).cards[last.id].title;
		await engine.port.move(last.id, { list: "inbox", before: null, dayOffset: 0, depth: 1, section: null });
		await old.core.tasks.nest((await oldItem(lastTitle)).key, (await oldItem(INBOX_SECOND)).key, null);
		expect(engine.file.text).toBe(old.file.text);
	});

	it("a card onto the calendar at a minute, and a block's end let go later", async () => {
		const { engine, old, idOf, oldItem } = await pair();
		await engine.port.move(idOf(INBOX_FIRST), { list: "day", before: null, dayOffset: 0, at: 600 });
		await old.core.tasks.drop([{ key: (await oldItem(INBOX_FIRST)).key, from: "inbox" }], { kind: "time", start: 600 }, old.core.days.today());
		expect(engine.file.text).toBe(old.file.text);
		const id = idOf(TIMED);
		const block = engine.port.read(0).day.blocks.find((b) => b.id === id)!;
		const end = block.start + (block.length ?? 0) + 45;
		await engine.port.move(id, engine.port.resized(id, 0, "end", end, 15)!);
		await old.core.tasks.resize((await oldItem(TIMED)).key, old.core.days.today(), "end", end, 15);
		expect(engine.file.text).toBe(old.file.text);
	});

	it("the menu's writes: a status, a level, a day, Remove due date, a list tile, a reminder, Delete", async () => {
		const { engine, old, idOf, oldItem } = await pair();
		const tasks = old.core.tasks;
		const step = async (title: string, act: Parameters<CorePort["act"]>[1], call: (key: TaskItem["key"]) => Promise<unknown>, from: "list" | "calendar" = "list") => {
			await engine.port.act(idOf(title), act, from, 0);
			await call((await oldItem(title)).key);
			expect({ title, act, text: engine.file.text }).toEqual({ title, act, text: old.file.text });
		};
		const today = old.core.days.today();
		const tomorrow = old.core.days.step(today, 1);
		await step(INBOX_FIRST, { kind: "priority", prefix: "p2" }, (key) => tasks.togglePriority([key], "p2"));
		await step(INBOX_FIRST, { kind: "date", date: tomorrow }, (key) => tasks.postponeAll([key], tomorrow));
		await step(INBOX_FIRST, { kind: "date", date: null }, (key) => tasks.removeDue([key]));
		await step(INBOX_SECOND, { kind: "sendTo", list: "backlog" }, (key) => tasks.sendTo([key], { kind: "backlog" }));
		await step(TIMED, { kind: "reminder", reminder: "alarm" }, (key) => tasks.setReminder(key, "alarm"), "calendar");
		await step(TIMED, { kind: "status", id: "inProgress" }, (key) => tasks.pickStatus([key], "inProgress"), "calendar");
		await step(INBOX_FIRST, { kind: "status", id: "done" }, (key) => tasks.pickStatus([key], "done"));
		await step(TIMED, { kind: "delete" }, (key) => tasks.remove(key), "calendar");
	});

	it("a new task typed at Inbox's end and a rename: the quick entry's writes", async () => {
		const { engine, old, oldItem, idOf } = await pair();
		const field = { at: engine.port.listEnd("inbox", 0), renaming: null, stack: false };
		await engine.port.commit(field, "Новая задача", { level: null, projects: [], descriptionLine: null, section: false, repeat: null }, false).write;
		const sections = (await old.core.tasks.screen(old.core.days.today())).sections.inbox;
		await old.core.tasks.createInPlace("Новая задача", null, { kind: "list", list: "inbox", group: sections[sections.length - 1].name, before: null });
		expect(engine.file.text).toBe(old.file.text);
		const rename = engine.port.rename(idOf(INBOX_SECOND), "list", 0);
		await engine.port.commit(rename.field, "Переименована", rename.draft, false).write;
		await old.core.tasks.rename((await oldItem(INBOX_SECOND)).key, "Переименована");
		expect(engine.file.text).toBe(old.file.text);
	});

	it("keeps the file's format: the agents' fixture, written through the engine, reads back as the old screen's", async () => {
		const { engine, old, idOf, oldItem } = await pair(AGENT_TASKS);
		const first = engine.port.read(0).lists.inbox.rows.find((row) => row.kind === "task");
		if (!first) throw new Error("no Inbox task");
		const title = engine.port.read(0).cards[first.id].title;
		await engine.port.move(idOf(title), { list: "soon", before: null, dayOffset: 0, depth: 0 });
		const sections = (await old.core.tasks.screen(old.core.days.today())).sections.soon;
		await old.core.tasks.moveToGroup((await oldItem(title)).key, "soon", sections[sections.length - 1].name, null);
		expect(engine.file.text).toBe(old.file.text);
	});
});
