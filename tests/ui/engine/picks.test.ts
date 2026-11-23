// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mockFile, twoColumnsFile } from "../../../obsidian/stand/mockData";
import { KEYS, takesKeys } from "../../../obsidian/ui/engine/keys";
import type { ScreenPort } from "../../../obsidian/ui/engine/port";
import { createScreenStore } from "../../../obsidian/ui/engine/store";
import { settled, standPort } from "./standPort";

const NOW = new Date(2026, 10, 21, 14, 20);
const NO_KEYS = { mod: false, shift: false };

async function screen(file = twoColumnsFile()) {
	const source = await standPort(NOW, file);
	const store = createScreenStore(source.port);
	const stop = store.getState().start();
	return { port: source.port, source, store, stop };
}

const inbox = (port: ScreenPort) => port.read(0).lists.inbox.rows.flatMap((row) => (row.kind === "task" ? [row.id] : []));

describe("Select tasks and ⌘-click (F135–F139, F145)", () => {
	it("picks with a tap in Select tasks, opens no card's menu, and its menu writes on them all and ends it", async () => {
		const { port, source, store, stop } = await screen();
		const [a, b] = inbox(port);
		store.getState().setPicking(true);
		expect(store.getState().tapPick(a, "inbox", NO_KEYS)).toBe(true);
		expect(store.getState().tapPick(b, "inbox", NO_KEYS)).toBe(true);
		expect(store.getState().picked).toEqual([a, b]);
		store.getState().openBulk();
		const layer = store.getState().layer!;
		expect(layer.many).toEqual([a, b]);
		expect(layer.model.kind === "task" && layer.model.title).toBe("2 tasks");
		expect(layer.model.kind === "task" && layer.model.deleteLabel).toBe("Delete 2 tasks");
		store.getState().pick({ kind: "status", id: "done" });
		expect(store.getState().picking).toBe(false);
		store.getState().layerGone();
		await settled(5);
		expect(inbox(port)).not.toContain(a);
		expect(inbox(port)).not.toContain(b);
		expect(source.fileText().match(/- \[x\]/g)?.length).toBeGreaterThanOrEqual(2);
		stop();
	});

	it("⌘-clicks a card, Shift-clicks the run to another, and a click on one of them opens their menu; a plain click elsewhere lets them go", async () => {
		const { port, store, stop } = await screen();
		const [a, b, c, d] = inbox(port);
		expect(store.getState().tapPick(a, "inbox", { mod: true, shift: false })).toBe(true);
		expect(store.getState().tapPick(c, "inbox", { mod: false, shift: true })).toBe(true);
		expect(store.getState().picked).toEqual([a, b, c]);
		expect(store.getState().tapPick(b, "inbox", NO_KEYS)).toBe(true);
		expect(store.getState().layer?.many).toEqual([a, b, c]);
		store.getState().closeLayer();
		expect(store.getState().tapPick(d, "inbox", NO_KEYS)).toBe(false);
		expect(store.getState().picked).toEqual([]);
		stop();
	});

	it("keeps the picks and the menu for the next project, the menu drawn for them as they now stand (F144)", async () => {
		const { port, store, stop } = await screen(mockFile(NOW));
		const [a, b] = inbox(port);
		store.getState().tapPick(a, "inbox", { mod: true, shift: false });
		store.getState().tapPick(b, "inbox", { mod: true, shift: false });
		store.getState().openBulk();
		const model = store.getState().layer!.model;
		const project = model.kind === "task" ? model.project.options.find((option) => !option.disabled && !option.on) : undefined;
		expect(project).toBeDefined();
		store.getState().actHere({ kind: "project", name: project!.name });
		await settled(5);
		const after = store.getState().layer!.model;
		expect(store.getState().layer?.many).toHaveLength(2);
		expect(after.kind === "task" && after.project.options.find((option) => option.name === project!.name)?.on).toBe(true);
		expect(store.getState().picked).toEqual([a, b]);
		stop();
	});

	it("Escape lets the picks go, and only while there are any (the key is left to Obsidian otherwise)", async () => {
		const { port, store, stop } = await screen();
		const escape = KEYS.find((key) => key.id === "stop-picking")!;
		expect(takesKeys(store.getState(), escape)).toBe(false);
		store.getState().tapPick(inbox(port)[0], "inbox", { mod: true, shift: false });
		expect(takesKeys(store.getState(), escape)).toBe(true);
		escape.run(store.getState());
		expect(store.getState().picked).toEqual([]);
		stop();
	});

	it("carries the other picks along with a picked card, and a stack that landed lets them go (F149)", async () => {
		const { port, store, stop } = await screen();
		const [a, b] = inbox(port);
		store.getState().tapPick(a, "inbox", { mod: true, shift: false });
		store.getState().tapPick(b, "inbox", { mod: true, shift: false });
		expect(store.getState().claim("drag")).toBe(true);
		store.getState().lift(a);
		expect(store.getState().along).toEqual([b]);
		store.getState().drop(a, { list: "soon", before: null, dayOffset: 0 });
		await settled(5);
		const soon = port.read(0).lists.soon.rows.map((row) => row.id);
		expect(soon).toEqual(expect.arrayContaining([a, b]));
		expect(store.getState().picked).toEqual([]);
		stop();
	});

	it("refuses a stack on the calendar", async () => {
		const { port, store, stop } = await screen();
		const [a, b] = inbox(port);
		store.getState().tapPick(a, "inbox", { mod: true, shift: false });
		store.getState().tapPick(b, "inbox", { mod: true, shift: false });
		store.getState().claim("drag");
		store.getState().lift(a);
		expect(store.getState().takes(a, { list: "day", before: null, dayOffset: 0, at: 600 })).toBe(false);
		stop();
	});
});

describe("the search (F252–F257)", () => {
	it("finds by the words typed, an older answer never over a newer, and a pick of Done's task brings Done in sight", async () => {
		const { port, source, store, stop } = await screen(mockFile(NOW));
		const done = /## Done\n\n(?:### .*\n)?- \[x\] (.+)/.exec(source.fileText())![1].split(" ").slice(0, 2).join(" ");
		store.getState().openSheet("search");
		store.getState().searchFor("щщщ");
		store.getState().searchFor(done);
		await settled(5);
		const { query, groups } = store.getState().found;
		expect(query).toBe(done);
		const doneGroup = groups.find((group) => group.title === "Done")!;
		expect(doneGroup.hits.length).toBeGreaterThan(0);
		store.getState().goToFound(doneGroup.hits[0].id);
		await settled(5);
		expect(store.getState().sheet).toBeNull();
		expect(store.getState().stop).toBe("done");
		expect(store.getState().context.done).toBe(true);
		expect(store.getState().ringed).toBe(doneGroup.hits[0].id);
		expect(store.getState().shown.lists.done.rows.some((row) => row.id === doneGroup.hits[0].id)).toBe(true);
		store.getState().touched();
		expect(store.getState().ringed).toBeNull();
		store.getState().setStop("inbox");
		await port.act(inbox(port)[0], { kind: "status", id: "inProgress" }, "list", 0);
		await settled(5);
		expect(store.getState().context.done).toBe(false);
		expect(store.getState().shown.lists.done.rows).toEqual([]);
		stop();
	});
});
