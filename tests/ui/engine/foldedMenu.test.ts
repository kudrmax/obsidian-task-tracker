import { describe, expect, it } from "vitest";
import { subtasksFile } from "../../../obsidian/stand/mockData";
import { createScreenStore } from "../../../obsidian/ui/engine/store";
import { standPort } from "./standPort";

const NOW = new Date(2026, 10, 18, 14, 20);

/**
 * Max, 2026-11-12: a tap on a card opens that card's menu, wherever on it the tap lands. A folded task's card shows its
 * next step in big type, yet its menu is the folded task's own; the step's menu is reached by unfolding it.
 */
describe("a folded task's card (Max, 2026-11-12)", () => {
	it("names its next step, and opens the folded task's own menu", async () => {
		const file = subtasksFile();
		const moving = file.soon[0].tasks.find((task) => task.title === "Переезд")!;
		moving.folded = true;
		const source = await standPort(NOW, file);
		const store = createScreenStore(source.port.within());
		const { read } = store.getState();
		const id = Object.keys(read.cards).find((key) => read.cards[key].title === "Переезд")!;
		expect(read.cards[id].step).toBe("Найти грузчиков");
		expect(read.lists.soon.rows.some((row) => row.id === id)).toBe(true);
		store.getState().openMenu(id, "list");
		const layer = store.getState().layer;
		expect(layer?.kind === "menu" && layer.id).toBe(id);
	});
});
