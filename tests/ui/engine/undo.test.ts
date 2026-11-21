// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { MockPort } from "../../../obsidian/stand/MockPort";
import { twoColumnsFile } from "../../../obsidian/stand/mockData";
import { KEYS } from "../../../obsidian/ui/engine/keys";
import { createScreenStore } from "../../../obsidian/ui/engine/store";

const NOW = new Date(2026, 10, 21, 14, 20);

function screen() {
	const port = new MockPort(() => NOW);
	port.delay = 0;
	port.reset(twoColumnsFile());
	const store = createScreenStore(port);
	const stop = store.getState().start();
	return { port, store, stop };
}

/** The port's write and the store's read of it done (the stand writes after a timer, the store reads once the write settles). */
const settled = () => new Promise((resolve) => setTimeout(resolve, 5));
const inbox = (port: MockPort) => port.read(0).lists.inbox.rows.flatMap((row) => (row.kind === "task" ? [row.id] : []));

describe("Undo (F267, F269): the screen's own writes, one step each", () => {
	it("is dim until the screen wrote something, then takes the write back and the task returns to its place", async () => {
		const { port, store, stop } = screen();
		expect(store.getState().canUndo).toBe(false);
		const before = inbox(port);
		await port.act(before[1], { kind: "status", id: "done" });
		await settled();
		expect(inbox(port)).not.toContain(before[1]);
		expect(store.getState().canUndo).toBe(true);
		expect(store.getState().gone.has(before[1])).toBe(true);
		store.getState().undo();
		await settled();
		expect(inbox(port)).toEqual(before);
		expect(store.getState().fresh.has(before[1])).toBe(true);
		expect(store.getState().canUndo).toBe(false);
		stop();
	});

	it("takes the steps back one by one, the last first", async () => {
		const { port, store, stop } = screen();
		const start = inbox(port);
		await port.act(start[0], { kind: "delete" });
		await port.act(start[2], { kind: "delete" });
		store.getState().undo();
		await settled();
		expect(inbox(port)).toEqual(start.filter((id) => id !== start[0]));
		store.getState().undo();
		await settled();
		expect(inbox(port)).toEqual(start);
		stop();
	});

	it("never takes back an edit from outside: Sync or a hand edit drops the steps before it", async () => {
		const { port, store, stop } = screen();
		const start = inbox(port);
		await port.act(start[0], { kind: "delete" });
		port.addFromOutside("inbox", "Пришла со стороны");
		await settled();
		expect(store.getState().canUndo).toBe(false);
		store.getState().undo();
		await settled();
		expect(port.fileText()).toContain("Пришла со стороны");
		stop();
	});

	it("⌘Z does what the button does (F268)", async () => {
		const { port, store, stop } = screen();
		const start = inbox(port);
		await port.act(start[0], { kind: "delete" });
		const key = KEYS.find((k) => k.id === "undo");
		expect(key && key.modifiers).toEqual(["Mod"]);
		key?.run(store.getState());
		await settled();
		expect(inbox(port)).toEqual(start);
		stop();
	});
});
