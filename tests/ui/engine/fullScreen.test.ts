// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { subtasksFile } from "../../../obsidian/stand/mockData";
import { createScreenStore } from "../../../obsidian/ui/engine/store";
import { standPort } from "./standPort";

const NOW = new Date(2026, 10, 18, 14, 20);
const wait = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

async function screen() {
	const source = await standPort(NOW, subtasksFile());
	const store = createScreenStore(source.port);
	const idOf = (title: string) => Object.values(store.getState().shown.cards).find((c) => c.title === title)!.id;
	const lineOf = (title: string) => source.fileText().split("\n").find((l) => l.includes(title)) ?? "";
	const titles = () => store.getState().full!.task.rows.map((row) => `${"  ".repeat(row.depth)}${store.getState().full!.task.faces[row.id].title}`);
	return { source, store, idOf, lineOf, titles };
}

describe("the full-screen task (F239–F249)", () => {
	it("shows the title, every subtask as a tree, no parent and the notes' editor text", async () => {
		const { store, idOf, titles } = await screen();
		store.getState().openFull(idOf("Спланировать отпуск"));
		const full = store.getState().full!;
		expect(full.task.title).toBe("Спланировать отпуск");
		expect(full.task.parent).toBeNull();
		expect(titles()).toEqual(["Выбрать даты", "Купить билеты", "  Сравнить цены", "Забронировать отель"]);
		expect(full.task.notes.text.length).toBeGreaterThanOrEqual(0);
	});

	it("a circle ticks a subtask done and back; the row stays, the counter follows at once", async () => {
		const { store, idOf, lineOf } = await screen();
		store.getState().openFull(idOf("Спланировать отпуск"));
		const row = store.getState().full!.task.rows[0];
		store.getState().tick(row.id);
		await wait();
		expect(lineOf("Выбрать даты")).toContain("- [x]");
		const after = store.getState().full!.task;
		expect(after.rows.find((r) => r.id === row.id)).toMatchObject({ status: "done", open: false });
		expect(after.faces[after.id].count).toEqual({ done: 1, total: 3 });
		store.getState().tick(row.id);
		await wait();
		expect(lineOf("Выбрать даты")).toContain("- [ ]");
	});

	it("a subtask's Open full screen goes a level in, its parent over its title; up comes back; Close leaves from any depth", async () => {
		const { store, idOf } = await screen();
		store.getState().openFull(idOf("Спланировать отпуск"));
		const tickets = store.getState().full!.task.rows[1].id;
		store.getState().openMenu(tickets, "fullSubtask");
		expect(store.getState().layer?.model.kind).toBe("task");
		store.getState().openFullFromMenu();
		expect(store.getState().layer).toBeNull();
		expect(store.getState().full!.ids).toHaveLength(2);
		expect(store.getState().full!.task.parent?.title).toBe("Спланировать отпуск");
		store.getState().fullUp();
		expect(store.getState().full!.task.title).toBe("Спланировать отпуск");
		store.getState().openFull(tickets);
		store.getState().closeFull();
		expect(store.getState().full).toBeNull();
	});

	it("the full screen's own task offers no Open full screen; a subtask's does", async () => {
		const { store, idOf } = await screen();
		const id = idOf("Спланировать отпуск");
		store.getState().openFull(id);
		store.getState().openMenu(id, "full");
		const opens = (store.getState().layer!.model as { layout: readonly { group: string; actions: readonly { id: string }[] }[] }).layout.flatMap((g) => g.actions.map((a) => a.id));
		expect(opens).not.toContain("openFull");
		store.getState().closeLayer();
		store.getState().openMenu(store.getState().full!.task.rows[0].id, "fullSubtask");
		const sub = (store.getState().layer!.model as { layout: readonly { actions: readonly { id: string }[] }[] }).layout.flatMap((g) => g.actions.map((a) => a.id));
		expect(sub).toContain("openFull");
	});

	it("falls back a level when the task leaves its place, and closes when none is left (F248)", async () => {
		const { store, idOf, source } = await screen();
		const stop = store.getState().start();
		store.getState().openFull(idOf("Спланировать отпуск"));
		const tickets = store.getState().full!.task.rows[1].id;
		store.getState().openFull(tickets);
		await source.port.act(tickets, { kind: "delete" }, "fullSubtask", 0);
		await wait();
		expect(store.getState().full!.task.title).toBe("Спланировать отпуск");
		await source.port.act(store.getState().full!.task.id, { kind: "delete" }, "full", 0);
		await wait();
		expect(store.getState().full).toBeNull();
		stop();
	});

	it("notes are written after a pause in typing, and at once when the screen leaves the task", async () => {
		const { store, idOf, source } = await screen();
		store.getState().openFull(idOf("Переезд"));
		store.getState().typeNotes("- позвонить в агентство");
		await wait(100);
		expect(source.fileText()).not.toContain("позвонить в агентство");
		await wait(650);
		expect(source.fileText()).toMatch(/Переезд\n(?:\t.*\n)*\t- позвонить в агентство/);
		store.getState().typeNotes("- позвонить в агентство\n- взять коробки");
		store.getState().closeFull();
		await wait(20);
		expect(source.fileText()).toContain("взять коробки");
	});

	it("the plus types a new last subtask, the field staying for the next; Rename from «⋯» makes the title the field", async () => {
		const { store, idOf, lineOf, titles } = await screen();
		const id = idOf("Переезд");
		store.getState().openFull(id);
		store.getState().fullPlus();
		expect(store.getState().entry?.full).toBe(true);
		expect(store.getState().fullAt).toEqual({ kind: "new", index: 2, depth: 0 });
		store.getState().commitEntry("Заказать машину", true);
		await wait(20);
		expect(titles()).toEqual(["Найти грузчиков", "Упаковать книги", "Заказать машину"]);
		expect(store.getState().entry?.full).toBe(true);
		store.getState().escapeEntry();
		store.getState().openMenu(id, "full");
		store.getState().startRename();
		expect(store.getState().fullAt).toEqual({ kind: "title" });
		store.getState().commitEntry("Переезд на дачу", false);
		await wait(20);
		expect(lineOf("Переезд на дачу")).toContain("- [ ]");
		expect(store.getState().full!.task.title).toBe("Переезд на дачу");
	});
});
