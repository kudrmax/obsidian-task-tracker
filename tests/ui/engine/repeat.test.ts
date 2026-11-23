// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mockFile } from "../../../obsidian/stand/mockData";
import type { TaskMenuModel } from "../../../obsidian/ui/engine/port";
import { createScreenStore } from "../../../obsidian/ui/engine/store";
import { standPort } from "./standPort";

const NOW = new Date(2026, 10, 18, 14, 20);
const wait = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

async function screen() {
	const source = await standPort(NOW, mockFile(NOW));
	const store = createScreenStore(source.port);
	const lineOf = (title: string) => source.fileText().split("\n").find((l) => l.includes(title)) ?? "";
	const task = Object.values(source.port.read(0).cards).find((c) => c.title === "Задача с описанием")!;
	return { source, store, lineOf, task };
}

describe("the Repeat page (F120, F202–F204; the design's «Повторы»)", () => {
	it("opens as a weekly schedule on the task's weekday, every 1, − dim, no Remove repeat", async () => {
		const { store, task } = await screen();
		store.getState().openMenu(task.id);
		const page = (store.getState().layer!.model as TaskMenuModel).repeat;
		expect(page.draft).toMatchObject({ kind: "schedule", every: 1, unit: "week", days: [2], detail: "weekdays", removable: false, can: { fewer: false } });
		expect(page.words.kinds).toEqual({ schedule: "Schedule", afterDone: "After done" });
	});

	it("shows each tap at once and writes the rule once, as the menu closes", async () => {
		const { store, lineOf, task, source } = await screen();
		store.getState().openMenu(task.id);
		store.getState().menuPage("repeat");
		store.getState().menuRepeat({ what: "unit", to: "day" });
		store.getState().menuRepeat({ what: "every", by: 1 });
		expect(store.getState().layer?.repeat?.page.draft).toMatchObject({ unit: "day", every: 2, detail: null });
		const before = source.fileText();
		expect(lineOf(task.title)).not.toContain("🔁");
		store.getState().menuRepeat({ what: "every", by: -1 });
		expect(source.fileText()).toBe(before);
		store.getState().closeLayer();
		store.getState().layerGone();
		await wait();
		expect(lineOf(task.title)).toContain("🔁 every day");
	});

	it("a rule taken back to the task's own writes nothing; − never goes under 1", async () => {
		const { store, task, source } = await screen();
		store.getState().openMenu(task.id);
		store.getState().menuPage("repeat");
		store.getState().menuRepeat({ what: "every", by: -1 });
		expect(store.getState().layer?.repeat).toBeNull();
		const before = source.fileText();
		store.getState().closeLayer();
		store.getState().layerGone();
		await wait();
		expect(source.fileText()).toBe(before);
	});

	it("a monthly schedule shows its day in words; Remove repeat takes the rule off and closes the menu", async () => {
		const { store, lineOf, task } = await screen();
		store.getState().openMenu(task.id);
		store.getState().menuPage("repeat");
		store.getState().menuRepeat({ what: "unit", to: "month" });
		expect(store.getState().layer?.repeat?.page.monthDay).toBe("On the 18th");
		store.getState().closeLayer();
		store.getState().layerGone();
		await wait();
		expect(lineOf(task.title)).toContain("🔁");
		store.getState().openMenu(Object.values(store.getState().shown.cards).find((c) => c.title === task.title)!.id);
		const page = (store.getState().layer!.model as TaskMenuModel).repeat;
		expect(page.draft.removable).toBe(true);
		store.getState().menuPage("repeat");
		store.getState().pick({ kind: "repeat", rule: null });
		expect(store.getState().layer).toBeNull();
		store.getState().layerGone();
		await wait();
		expect(lineOf(task.title)).not.toContain("🔁");
	});

	it("a status picked after a change writes the rule first, then the status", async () => {
		const { store, lineOf, task } = await screen();
		store.getState().openMenu(task.id);
		store.getState().menuPage("repeat");
		store.getState().menuRepeat({ what: "unit", to: "day" });
		store.getState().menuPage("menu");
		store.getState().pick({ kind: "priority", prefix: "p1" });
		store.getState().layerGone();
		await wait(20);
		expect(lineOf(task.title)).toMatch(/p1 .*🔁 every day/);
	});

	it("the bar's panel sets the field's rule at once, written with the task; Remove repeat takes it off", async () => {
		const { store, lineOf } = await screen();
		store.getState().plusTap(["soon", "day"]);
		store.getState().showEntryPanel("repeat");
		expect(store.getState().entryRepeat?.draft.kind).toBe("schedule");
		store.getState().entryRepeatTap({ what: "kind", to: "afterDone" });
		expect(store.getState().draft.repeat?.kind).toBe("afterDone");
		expect(store.getState().bar!.bar.flatMap((g) => g.actions).find((a) => a.id === "repeat")?.lit).toBe(true);
		store.getState().commitEntry("Полить цветы", true);
		await wait(20);
		expect(lineOf("Полить цветы")).toMatch(/🔁 every week when done|🔁 every week/);
		expect(store.getState().draft.repeat).toBeNull();
		store.getState().showEntryPanel("repeat");
		store.getState().entryRepeatTap({ what: "unit", to: "day" });
		store.getState().removeEntryRepeat();
		expect(store.getState().draft.repeat).toBeNull();
		expect(store.getState().entryPanel).toBeNull();
	});
});
