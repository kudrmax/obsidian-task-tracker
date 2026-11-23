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
	const stop = store.getState().start();
	const idOf = (title: string) => Object.values(store.getState().shown.cards).find((c) => c.title === title)!.id;
	const inbox = () => store.getState().shown.lists.inbox.rows.map((r) => (r.kind === "task" ? store.getState().shown.cards[r.id].title : r.title));
	return { source, store, stop, idOf, inbox };
}

describe("First step (F125, F199–F201)", () => {
	it("folds the task in the menu's tap: its subtasks leave the list, its card the task's title over an empty step line", async () => {
		const { store, stop, idOf, inbox } = await screen();
		const id = idOf("Спланировать отпуск");
		store.getState().openMenu(id);
		store.getState().startFirstStep();
		await wait();
		expect(store.getState().layer).toBeNull();
		expect(store.getState().firstStep).toBe(id);
		expect(inbox()).not.toContain("Выбрать даты");
		expect(store.getState().shown.cards[id]).toMatchObject({ title: "Спланировать отпуск", step: "", folded: true });
		stop();
	});

	it("Enter writes the step as the first subtask and the task stays folded on it", async () => {
		const { store, stop, idOf, source } = await screen();
		const id = idOf("Спланировать отпуск");
		store.getState().openMenu(id);
		store.getState().startFirstStep();
		store.getState().endFirstStep("p1 Позвонить в агентство");
		await wait(20);
		expect(source.fileText()).toMatch(/Спланировать отпуск 📁\n\t- \[ \] p1 Позвонить в агентство\n\t- \[ \] Выбрать даты/);
		expect(store.getState().firstStep).toBeNull();
		expect(store.getState().shown.cards[id]).toMatchObject({ step: "Позвонить в агентство", folded: true });
		stop();
	});

	it("Escape writes nothing and the card returns as it was, its subtasks back", async () => {
		const { store, stop, idOf, source, inbox } = await screen();
		const before = source.fileText();
		store.getState().openMenu(idOf("Спланировать отпуск"));
		store.getState().startFirstStep();
		store.getState().endFirstStep(null);
		await wait();
		expect(source.fileText()).toBe(before);
		expect(inbox()).toContain("Выбрать даты");
		stop();
	});
});
