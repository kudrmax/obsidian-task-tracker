// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { viewLayout } from "../../../core/application/contracts";
import { mockFile } from "../../../obsidian/stand/mockData";
import { columnsOf, reachOf, stopShowing } from "../../../obsidian/ui/engine/layout/columns";
import { LAYER_MS } from "../../../obsidian/ui/engine/layers/motion";
import { share } from "../../../obsidian/ui/engine/store/share";
import { createScreenStore, type ScreenStore } from "../../../obsidian/ui/engine/store";
import { settled, standPort } from "./standPort";

const NOW = new Date(2026, 10, 18, 14, 20);

async function screen() {
	const source = await standPort(NOW);
	const port = source.port;
	return { port, source, store: createScreenStore(port) };
}

const titles = (store: ScreenStore, list: "inbox" | "soon" | "day") =>
	store.getState().shown.lists[list].rows.flatMap((row) => (row.kind === "task" ? [store.getState().shown.cards[row.id].title] : []));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the screen's store", () => {
	it("draws a drop at once and keeps it through the write's read-back, each card's face the same object", async () => {
		const { source, store } = await screen();
		const [a, b, c] = titles(store, "inbox");
		const ids = store.getState().shown.lists.inbox.rows.filter((r) => r.kind === "task").map((r) => r.id);
		const face = store.getState().shown.cards[ids[0]];
		store.getState().start();
		expect(store.getState().claim("drag")).toBe(true);
		store.getState().lift(ids[0]);
		store.getState().drop(ids[0], { list: "inbox", before: ids[3], dayOffset: 0 });
		expect(titles(store, "inbox").slice(0, 3)).toEqual([b, c, a]);
		await settle();
		await settle();
		expect(titles(store, "inbox").slice(0, 3)).toEqual([b, c, a]);
		const fileInbox = source.fileText().split("## Inbox\n")[1].split("\n").filter((line) => line.trim() !== "").slice(0, 3).map((line) => line.replace(/^- \[ \] (p1 )?/, ""));
		expect(fileInbox).toEqual([b, c, a]);
		expect(store.getState().shown.cards[ids[0]]).toBe(face);
		expect(store.getState().gesture).toBeNull();
	});

	it("holds data that comes during a drag and draws it once the drag ends", async () => {
		const { source, store } = await screen();
		store.getState().start();
		store.getState().claim("drag");
		source.addFromOutside("inbox", "Пришла во время переноса");
		await settled();
		expect(titles(store, "inbox")[0]).not.toBe("Пришла во время переноса");
		expect(store.getState().pending).toBe(true);
		store.getState().drop("t1", null);
		expect(titles(store, "inbox")[0]).toBe("Пришла во время переноса");
		expect(store.getState().fresh.has(store.getState().shown.lists.inbox.rows.find((r) => r.kind === "task")!.id)).toBe(true);
	});

	it("gives the pointer to one gesture at a time; a drag's long press takes it", async () => {
		const { store } = await screen();
		expect(store.getState().claim("ribbon")).toBe(true);
		expect(store.getState().claim("drag")).toBe(true);
		expect(store.getState().claim("ribbon")).toBe(false);
		store.getState().release("drag");
		expect(store.getState().claim("ribbon")).toBe(true);
	});

	it("opens a task's menu with what the port offers; a tap closes it first and writes once the layer says it has faded out, never by a timer of its own", async () => {
		const { store } = await screen();
		store.getState().start();
		const id = store.getState().shown.lists.inbox.rows.find((r) => r.kind === "task")!.id;
		store.getState().openMenu(id);
		const model = store.getState().layer!.model;
		const when = model.kind === "task" ? model.layout.find((group) => group.group === "when")!.actions : [];
		expect(when.map((action) => action.id)).toEqual(["today", "tomorrow", "pickDate", "repeat"]);
		store.getState().pick({ kind: "date", date: when[0].date });
		expect(store.getState().layer).toBeNull();
		expect(titles(store, "day")).not.toContain(model.title);
		await new Promise((resolve) => setTimeout(resolve, LAYER_MS.close + 20));
		expect(titles(store, "day")).not.toContain(model.title);
		store.getState().layerGone();
		await settle();
		expect(titles(store, "day")).toContain(model.title);
		expect(titles(store, "inbox")).not.toContain(model.title);
	});
});

describe("one rule for a menu whose task the screen no longer shows (review of part 1, finding 4)", () => {
	it("closes it when a read no longer has the task, as another context does", async () => {
		const { source, store } = await screen();
		const file = mockFile(NOW);
		store.getState().start();
		const id = store.getState().shown.lists.inbox.rows.find((r) => r.kind === "task")!.id;
		store.getState().openMenu(id);
		expect(store.getState().layer?.id).toBe(id);
		const without = structuredClone(file);
		without.inbox[0].tasks.shift();
		source.reset(without);
		await settled();
		expect(store.getState().layer).toBeNull();
	});
});

describe("what the store owns ends with the screen (review of part 1, finding 9)", () => {
	it("forgets the edge a carried card headed into when the screen stops: the quarter second's wait arms nothing after", async () => {
		const { store } = await screen();
		const stop = store.getState().start();
		store.getState().scrollToward("list:inbox:-1");
		stop();
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(store.getState().scrollArmed).toBe(false);
	});
});

describe("the field's bar, ready in the store (review of part 1, finding 10)", () => {
	it("asks the port for the bar only when the field, what the bar set, the text or the read changes", async () => {
		const { port, store } = await screen();
		let asked = 0;
		const entryBar = port.entryBar.bind(port);
		port.entryBar = (...args) => {
			asked++;
			return entryBar(...args);
		};
		store.getState().plusTap(["soon", "day"]);
		expect(store.getState().bar).not.toBeNull();
		const once = asked;
		store.getState().select("t1");
		store.getState().setZoom(80);
		store.getState().setPlusMinute(600);
		store.getState().showEntryPanel("priority");
		expect(asked).toBe(once);
		store.getState().typeEntry("Новая");
		expect(asked).toBe(once + 1);
		store.getState().openEntry(null);
		expect(store.getState().bar).toBeNull();
	});
});

describe("what each stop shows, said once by the layout (review of part 1, finding 3)", () => {
	it("gives the lists of each stop and place, what a place can reach, and the stop that brings a list into sight", () => {
		const two = viewLayout("twoColumns", false, () => null);
		const rows = viewLayout("rows", false, () => null);
		expect(columnsOf("leaf", "inbox", two)).toEqual(["inbox", "backlog", "soon"]);
		expect(columnsOf("leaf", "soon", two)).toEqual(["soon", "day"]);
		expect(columnsOf("leaf", "calendar", two)).toEqual(["day"]);
		expect(columnsOf("note", "calendar", two)).toEqual(["inbox"]);
		expect(columnsOf("leaf", "calendar", rows)).toEqual(["inbox", "backlog", "soon", "day"]);
		expect(reachOf("leaf", two)).toEqual(["inbox", "backlog", "soon", "day"]);
		expect(reachOf("note", two)).toEqual(["inbox"]);
		expect(stopShowing("calendar", "day")).toBe("calendar");
		expect(stopShowing("calendar", "inbox")).toBe("inbox");
		expect(stopShowing("calendar", "soon")).toBe("soon");
		expect(stopShowing("calendar", "backlog")).toBe("inbox");
		expect(stopShowing("inbox", "day")).toBe("soon");
		expect(stopShowing("inbox", "soon")).toBe("inbox");
	});
});

describe("the days drawn beside the shown one", () => {
	it("reads the days a finger draws into sight, and keeps what they drew when one of them is shown", async () => {
		const { store } = await screen();
		store.getState().peekDays([0, 1, 2]);
		const { left, dayOffset } = store.getState();
		expect(dayOffset).toBe(0);
		expect(left[1].shown.day.title).toBe("Tomorrow");
		expect(left[2].shown.day.title).not.toBe("Tomorrow");
		const drawn = left[1].shown;
		store.getState().peekDays([0, 1, 2]);
		expect(store.getState().left[1].shown).toBe(drawn);
		store.getState().showDay(1);
		expect(store.getState().dayOffset).toBe(1);
		expect(store.getState().shown.lists.day).toBe(drawn.lists.day);
		expect(store.getState().left[0].shown.day.title).toBe("Today");
		store.getState().showDay(0);
		expect(store.getState().shown.day.title).toBe("Today");
	});
});

describe("structural sharing", () => {
	it("keeps every equal part's identity and replaces only what changed", () => {
		const prev = { a: { x: 1 }, b: [{ y: 2 }, { y: 3 }], c: "z" };
		const next = share(prev, { a: { x: 1 }, b: [{ y: 2 }, { y: 4 }], c: "z" });
		expect(next.a).toBe(prev.a);
		expect(next.b[0]).toBe(prev.b[0]);
		expect(next.b[1]).not.toBe(prev.b[1]);
		expect(share(prev, structuredClone(prev))).toBe(prev);
	});
});
