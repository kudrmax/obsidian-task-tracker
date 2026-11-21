// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { ScreenData } from "../../../obsidian/ui/engine/port";
import { createScreenStore } from "../../../obsidian/ui/engine/store";
import { standPort } from "./standPort";

const NOW = new Date(2026, 10, 21, 14, 20);

async function screen() {
	const { port } = await standPort(NOW);
	return { port, store: createScreenStore(port) };
}

const titles = (data: ScreenData) => data.lists.day.rows.flatMap((row) => (row.kind === "task" ? [data.cards[row.id].title] : []));

describe("a change of context (F23, Decision 132)", async () => {
	it("reads the day pages drawn beside the shown one in the new context: none is left to draw the shown day's rows a second time", async () => {
		const { port, store } = await screen();
		store.getState().peekDays([0, 1]);
		expect(Object.keys(store.getState().left)).toEqual(["1"]);
		store.getState().setContext({ project: "Дом" });
		const { left, read } = store.getState();
		expect(Object.keys(left)).toEqual(["1"]);
		expect(titles(left[1].read)).toEqual(titles(port.read(1, { project: "Дом" })));
		expect(titles(left[1].shown)).toEqual(titles(port.read(1, { project: "Дом" })));
		expect(titles(read)).toEqual(titles(port.read(0, { project: "Дом" })));
	});

	it("counts the contexts and starts with nothing come or gone: the new context draws in place", async () => {
		const { store } = await screen();
		const seq = store.getState().contextSeq;
		store.getState().setContext({ project: "Дом" });
		expect(store.getState().contextSeq).toBe(seq + 1);
		expect(store.getState().fresh.size).toBe(0);
		expect(store.getState().gone.size).toBe(0);
		store.getState().setContext({ project: "Дом" });
		expect(store.getState().contextSeq).toBe(seq + 1);
	});

	it("waits for a drag to end: what the finger holds stays still under it (principle 5)", async () => {
		const { store } = await screen();
		store.getState().claim("drag");
		store.getState().setContext({ project: "Дом" });
		expect(store.getState().context.project).toBeNull();
		store.getState().release("drag");
		expect(store.getState().context.project).toBe("Дом");
	});

	it("closes a menu whose task the new context doesn't show, and keeps one whose task it does", async () => {
		const { port, store } = await screen();
		const day = port.read(0);
		const home = port.read(0, { project: "Дом" });
		const theirs = day.lists.day.rows.find((row) => row.kind === "task" && row.id in home.cards)!.id;
		const other = day.lists.day.rows.find((row) => row.kind === "task" && !(row.id in home.cards))!.id;
		store.getState().openMenu(theirs);
		store.getState().setContext({ project: "Дом" });
		expect(store.getState().layer?.id).toBe(theirs);
		store.getState().setContext({ project: null });
		store.getState().openMenu(other);
		store.getState().setContext({ project: "Дом" });
		expect(store.getState().layer).toBeNull();
	});
});
