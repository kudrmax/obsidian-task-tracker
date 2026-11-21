// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { MockPort } from "../../../obsidian/stand/MockPort";
import { LAYER_MS } from "../../../obsidian/ui/engine/layers/motion";
import { share } from "../../../obsidian/ui/engine/store/share";
import { createScreenStore } from "../../../obsidian/ui/engine/store";

const NOW = new Date(2026, 10, 18, 14, 20);

function screen() {
	const port = new MockPort(() => NOW);
	port.delay = 0;
	return { port, store: createScreenStore(port) };
}

const titles = (store: ReturnType<typeof screen>["store"], list: "inbox" | "soon" | "day") =>
	store.getState().shown.lists[list].rows.flatMap((row) => (row.kind === "task" ? [store.getState().shown.cards[row.id].title] : []));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the screen's store", () => {
	it("draws a drop at once and keeps it through the write's read-back, each card's face the same object", async () => {
		const { port, store } = screen();
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
		const fileInbox = port.fileText().split("## Inbox\n")[1].split("\n").slice(0, 3).map((line) => line.replace(/^- \[ \] (p1 )?/, ""));
		expect(fileInbox).toEqual([b, c, a]);
		expect(store.getState().shown.cards[ids[0]]).toBe(face);
		expect(store.getState().gesture).toBeNull();
	});

	it("holds data that comes during a drag and draws it once the drag ends", () => {
		const { port, store } = screen();
		store.getState().start();
		store.getState().claim("drag");
		port.addFromOutside("inbox", "Пришла во время переноса");
		expect(titles(store, "inbox")[0]).not.toBe("Пришла во время переноса");
		expect(store.getState().pending).toBe(true);
		store.getState().drop("t1", null);
		expect(titles(store, "inbox")[0]).toBe("Пришла во время переноса");
		expect(store.getState().fresh.has(store.getState().shown.lists.inbox.rows.find((r) => r.kind === "task")!.id)).toBe(true);
	});

	it("gives the pointer to one gesture at a time; a drag's long press takes it", () => {
		const { store } = screen();
		expect(store.getState().claim("ribbon")).toBe(true);
		expect(store.getState().claim("drag")).toBe(true);
		expect(store.getState().claim("ribbon")).toBe(false);
		store.getState().release("drag");
		expect(store.getState().claim("ribbon")).toBe(true);
	});

	it("opens a task's menu with what the port offers; a tap closes it first and writes once it has faded out", async () => {
		const { store } = screen();
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
		const day = titles(store, "day");
		expect(day[day.length - 1]).toBe(model.title);
		expect(titles(store, "inbox")).not.toContain(model.title);
	});
});

describe("the days drawn beside the shown one", () => {
	it("reads the days a finger draws into sight, and keeps what they drew when one of them is shown", () => {
		const { store } = screen();
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
