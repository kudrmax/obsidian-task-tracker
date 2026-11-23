// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { calendarFile, mockFile } from "../../../obsidian/stand/mockData";
import type { TaskMenuModel } from "../../../obsidian/ui/engine/port";
import { createScreenStore } from "../../../obsidian/ui/engine/store";
import { standPort } from "./standPort";

const NOW = new Date(2026, 10, 18, 14, 20);
const wait = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

async function screen() {
	const source = await standPort(NOW, mockFile(NOW));
	const store = createScreenStore(source.port);
	const lineOf = (title: string) => source.fileText().split("\n").find((l) => l.includes(title)) ?? "";
	const inboxTask = () => {
		const row = source.port.read(0).lists.inbox.rows.find((r) => r.kind === "task")!;
		return source.port.read(0).cards[row.id];
	};
	return { source, store, lineOf, inboxTask };
}

describe("the menu's Section page (F121)", () => {
	it("offers the list's sections and the presets, the task's own checked, the tasks outside any by their name, New section last", async () => {
		const { store, inboxTask } = await screen();
		store.getState().openMenu(inboxTask().id);
		const sections = (store.getState().layer!.model as TaskMenuModel).sections!;
		expect(sections.create).toBe(true);
		expect(sections.options.filter((o) => o.checked)).toHaveLength(1);
		expect(sections.options.map((o) => o.label)).toContain("Morning");
		expect(sections.options.some((o) => o.name === null)).toBe(true);
	});

	it("a section picked moves the task into it as the menu closes", async () => {
		const { store, inboxTask, source } = await screen();
		const task = inboxTask();
		store.getState().openMenu(task.id);
		store.getState().menuPage("sections");
		store.getState().pick({ kind: "section", name: "Morning" });
		expect(store.getState().layer).toBeNull();
		store.getState().layerGone();
		await wait();
		expect(source.fileText()).toMatch(new RegExp(`## Inbox[\\s\\S]*### Morning\\n- \\[ \\] (?:p\\d )?${task.title}`));
	});

	it("New section: the menu closes, the task waits for the name; Escape puts it back, a name makes the section with the task in it", async () => {
		const { store, inboxTask, source } = await screen();
		const task = inboxTask();
		const before = source.fileText();
		store.getState().openMenu(task.id);
		store.getState().menuPage("sections");
		store.getState().startNewSection();
		expect(store.getState().layer).toBeNull();
		expect(store.getState().namingSection).toBe(task.id);
		store.getState().endNewSection(null);
		await wait();
		expect(source.fileText()).toBe(before);
		store.getState().openMenu(task.id);
		store.getState().startNewSection();
		store.getState().endNewSection("Дача");
		await wait();
		expect(store.getState().namingSection).toBeNull();
		expect(source.fileText()).toMatch(new RegExp(`### Дача\\n- \\[ \\] (?:p\\d )?${task.title}`));
	});

	it("is not offered where the column shows no sections (the calendar)", async () => {
		const { store, inboxTask } = await screen();
		store.getState().openMenu(inboxTask().id, "calendar");
		expect((store.getState().layer!.model as TaskMenuModel).sections).toBeNull();
	});
});

describe("the rows that leave the screen (F126; the event menu)", () => {
	it("Open in Obsidian opens the tasks file at the task's line, as the menu closes", async () => {
		const { store, inboxTask, source } = await screen();
		const task = inboxTask();
		store.getState().openMenu(task.id);
		store.getState().pick({ kind: "row", id: "openInObsidian" });
		store.getState().layerGone();
		await wait();
		const line = source.fileText().split("\n").findIndex((l) => l.includes(task.title));
		expect(source.opened()).toEqual([`line ${line}`]);
	});

	it("Open in Calendar opens Apple's Calendar at the event", async () => {
		const source = await standPort(NOW, calendarFile(NOW));
		source.port.read(0);
		await wait();
		const event = source.port.read(0).day.events.find((e) => e.title === "Встреча с дизайнером")!;
		const store = createScreenStore(source.port);
		store.getState().openMenu(event.id, "calendar");
		store.getState().pick({ kind: "row", id: "calendar" });
		store.getState().layerGone();
		await wait();
		expect(source.opened()).toEqual(["event Встреча с дизайнером"]);
	});
});
