// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { MockPort } from "../../../obsidian/stand/MockPort";
import { createScreenStore } from "../../../obsidian/ui/engine/store";

const NOW = new Date(2026, 10, 21, 14, 20);

function screen() {
	const port = new MockPort(() => NOW);
	port.delay = 0;
	return { port, store: createScreenStore(port) };
}

const titles = (data: ReturnType<MockPort["read"]>) => data.lists.day.rows.flatMap((row) => (row.kind === "task" ? [data.cards[row.id].title] : []));

describe("a change of context (F23, Decision 132)", () => {
	it("reads the day pages drawn beside the shown one in the new context: none is left to draw the shown day's rows a second time", () => {
		const { port, store } = screen();
		store.getState().peekDays([0, 1]);
		expect(Object.keys(store.getState().left)).toEqual(["1"]);
		store.getState().setContext({ project: "Дом" });
		const { left, read } = store.getState();
		expect(Object.keys(left)).toEqual(["1"]);
		expect(titles(left[1].read)).toEqual(titles(port.read(1, { project: "Дом" })));
		expect(titles(left[1].shown)).toEqual(titles(port.read(1, { project: "Дом" })));
		expect(titles(read)).toEqual(titles(port.read(0, { project: "Дом" })));
	});

	it("counts the contexts and starts with nothing come or gone: the new context draws in place", () => {
		const { store } = screen();
		const seq = store.getState().contextSeq;
		store.getState().setContext({ project: "Дом" });
		expect(store.getState().contextSeq).toBe(seq + 1);
		expect(store.getState().fresh.size).toBe(0);
		expect(store.getState().gone.size).toBe(0);
		store.getState().setContext({ project: "Дом" });
		expect(store.getState().contextSeq).toBe(seq + 1);
	});
});
