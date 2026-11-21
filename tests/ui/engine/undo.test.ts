// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { twoColumnsFile } from "../../../obsidian/stand/mockData";
import { KEYS } from "../../../obsidian/ui/engine/keys";
import type { ScreenPort } from "../../../obsidian/ui/engine/port";
import { createScreenStore } from "../../../obsidian/ui/engine/store";
import { standPort } from "./standPort";

const NOW = new Date(2026, 10, 21, 14, 20);

async function screen() {
	const source = await standPort(NOW, twoColumnsFile());
	const port = source.port;
	const store = createScreenStore(port);
	const stop = store.getState().start();
	return { port, source, store, stop };
}

/** The port's write and the store's read of it done. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 5));
const inbox = (port: ScreenPort) => port.read(0).lists.inbox.rows.flatMap((row) => (row.kind === "task" ? [row.id] : []));

describe("Undo (F267, F269): the screen's own writes, one step each", () => {
	it("is dim until the screen wrote something, then takes the write back and the task returns to its place", async () => {
		const { port, store, stop } = await screen();
		expect(store.getState().canUndo).toBe(false);
		const before = inbox(port);
		await port.act(before[1], { kind: "status", id: "done" }, "list", 0);
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
		const { port, store, stop } = await screen();
		const start = inbox(port);
		await port.act(start[0], { kind: "delete" }, "list", 0);
		await port.act(start[2], { kind: "delete" }, "list", 0);
		store.getState().undo();
		await settled();
		expect(inbox(port)).toEqual(start.filter((id) => id !== start[0]));
		store.getState().undo();
		await settled();
		expect(inbox(port)).toEqual(start);
		stop();
	});

	it("never takes back an edit from outside (F269, F270): a step the file changed under is refused with the port's notice, and dropped", async () => {
		const { port, source, store, stop } = await screen();
		const start = inbox(port);
		await port.act(start[0], { kind: "delete" }, "list", 0);
		source.addFromOutside("inbox", "Пришла со стороны");
		await settled();
		expect(store.getState().canUndo).toBe(true);
		store.getState().undo();
		await settled();
		expect(source.fileText()).toContain("Пришла со стороны");
		expect(inbox(port)).not.toContain(start[0]);
		expect(store.getState().notice?.text).toBe("Can’t undo: the tasks file changed");
		expect(store.getState().canUndo).toBe(false);
		stop();
	});

	it("⌘⇧Z does a step taken back again, and a new step leaves nothing to do again (F268)", async () => {
		const { port, store, stop } = await screen();
		const start = inbox(port);
		await port.act(start[0], { kind: "delete" }, "list", 0);
		store.getState().undo();
		await settled();
		expect(inbox(port)).toEqual(start);
		expect(store.getState().canRedo).toBe(true);
		KEYS.find((k) => k.id === "redo")?.run(store.getState());
		await settled();
		expect(inbox(port)).not.toContain(start[0]);
		expect(store.getState().canRedo).toBe(false);
		store.getState().undo();
		await settled();
		await port.act(start[1], { kind: "delete" }, "list", 0);
		await settled();
		expect(store.getState().canRedo).toBe(false);
		stop();
	});

	it("what came in a read comes in only until the screen has drawn that read, however soon a row mounts again", async () => {
		const { port, store, stop } = await screen();
		const start = inbox(port);
		await port.act(start[0], { kind: "delete" }, "list", 0);
		store.getState().undo();
		await settled();
		const { fresh, readSeq } = store.getState();
		expect(fresh.has(start[0])).toBe(true);
		store.getState().drawn(readSeq - 1);
		expect(store.getState().fresh.has(start[0])).toBe(true);
		store.getState().drawn(readSeq);
		expect(store.getState().fresh.size).toBe(0);
		const none = store.getState().fresh;
		store.getState().drawn(readSeq);
		expect(store.getState().fresh).toBe(none);
		stop();
	});

	it("⌘Z does what the button does (F268)", async () => {
		const { port, store, stop } = await screen();
		const start = inbox(port);
		await port.act(start[0], { kind: "delete" }, "list", 0);
		const key = KEYS.find((k) => k.id === "undo");
		expect(key && key.modifiers).toEqual(["Mod"]);
		key?.run(store.getState());
		await settled();
		expect(inbox(port)).toEqual(start);
		stop();
	});
});
