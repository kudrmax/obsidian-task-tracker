// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { MockPort } from "../../../obsidian/stand/MockPort";
import { swipeStep } from "../../../obsidian/ui/engine/gestures/swipeStep";
import { COLUMN_SHARE, offsetOf, shownAt, STRIP_WIDTH } from "../../../obsidian/ui/engine/layout/columns";
import { share } from "../../../obsidian/ui/engine/store/share";
import { createScreenStore } from "../../../obsidian/ui/engine/store";

const NOW = new Date(2026, 10, 18, 14, 20);

function screen() {
	const port = new MockPort(() => NOW);
	port.delay = 0;
	return { port, store: createScreenStore(port) };
}

const titles = (port: MockPort, store: ReturnType<typeof screen>["store"], list: "inbox" | "soon" | "day") =>
	store.getState().shown.lists[list].rows.flatMap((row) => (row.kind === "task" ? [store.getState().shown.cards[row.id].title] : []));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Max asked twice (CLAUDE.md, «Behaviours Max had to ask for twice»): one swipe of the lists moves them one place, never
 * two, from the very first swipe after launch. In the engine the swipe's rule is `swipeStep` and the step is the store's.
 */
describe("one swipe, one place (Max)", () => {
	it("a swipe goes at most one place whatever its length or speed", () => {
		for (const moved of [-900, -300, -100, -10, 0, 10, 100, 300, 900]) for (const flick of [-1, 0, 1]) expect(Math.abs(swipeStep(moved, 195, flick))).toBeLessThanOrEqual(1);
		expect(swipeStep(400, 195, 0)).toBe(1);
		expect(swipeStep(90, 195, 0)).toBe(0);
		expect(swipeStep(20, 195, 1)).toBe(1);
		expect(swipeStep(-20, 195, -1)).toBe(-1);
	});

	it("the first step after the screen opens moves the ribbon one stop", () => {
		const { store } = screen();
		expect(store.getState().stop).toBe("calendar");
		store.getState().step(-1);
		expect(store.getState().stop).toBe("soon");
		store.getState().step(-1);
		expect(store.getState().stop).toBe("inbox");
		store.getState().step(-1);
		expect(store.getState().stop).toBe("inbox");
	});

	it("past the day's calendar a step turns the day, and back on today returns to Soon", () => {
		const { store } = screen();
		store.getState().step(1);
		expect(store.getState()).toMatchObject({ stop: "calendar", dayOffset: 1, dayWay: 1 });
		expect(store.getState().shown.day.title).toBe("Tomorrow");
		store.getState().step(-1);
		expect(store.getState()).toMatchObject({ stop: "calendar", dayOffset: 0, dayWay: -1 });
		store.getState().step(-1);
		expect(store.getState().stop).toBe("soon");
	});
});

/** Max asked twice: at Inbox and at Soon the two columns split the screen in half. */
describe("halves at Inbox and Soon (Max)", () => {
	it("each shown column is half the window", () => {
		for (const stop of ["inbox", "soon"] as const) {
			expect(shownAt(stop)).toHaveLength(2);
			expect((STRIP_WIDTH * COLUMN_SHARE) / 100).toBe(50);
		}
		expect(shownAt("inbox")).toEqual(["inbox", "soon"]);
		expect(shownAt("soon")).toEqual(["soon", "day"]);
		expect(shownAt("calendar")).toEqual(["day", "timeline"]);
		expect([offsetOf("inbox"), offsetOf("soon"), offsetOf("calendar")]).toEqual([0, 1, 2]);
	});
});

describe("the screen's store", () => {
	it("draws a drop at once and keeps it through the write's read-back, each card's face the same object", async () => {
		const { port, store } = screen();
		const [a, b, c] = titles(port, store, "inbox");
		const ids = store.getState().shown.lists.inbox.rows.filter((r) => r.kind === "task").map((r) => r.id);
		const face = store.getState().shown.cards[ids[0]];
		store.getState().start();
		expect(store.getState().claim("drag")).toBe(true);
		store.getState().lift(ids[0]);
		store.getState().drop(ids[0], { list: "inbox", before: ids[3], dayOffset: 0 });
		expect(titles(port, store, "inbox").slice(0, 3)).toEqual([b, c, a]);
		await settle();
		await settle();
		expect(titles(port, store, "inbox").slice(0, 3)).toEqual([b, c, a]);
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
		expect(titles(port, store, "inbox")[0]).not.toBe("Пришла во время переноса");
		expect(store.getState().pending).toBe(true);
		store.getState().drop("t1", null);
		expect(titles(port, store, "inbox")[0]).toBe("Пришла во время переноса");
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

	it("opens a task's menu with what the port offers, and runs an item through the port", async () => {
		const { store } = screen();
		store.getState().start();
		const id = store.getState().shown.lists.inbox.rows.find((r) => r.kind === "task")!.id;
		store.getState().openMenu(id);
		expect(store.getState().layer?.items.map((i) => i.label)).toEqual(["Soon", "Today"]);
		store.getState().act(id, "soon");
		expect(store.getState().layer).toBeNull();
		await settle();
		await settle();
		expect(store.getState().shown.lists.soon.rows[0].id).toBe(id);
	});
});

describe("the day's slide", () => {
	it("keeps every day still sliding out, however fast the strokes came", () => {
		const { store } = screen();
		store.getState().step(1);
		store.getState().step(1);
		store.getState().step(-1);
		const { left, dayOffset } = store.getState();
		expect(dayOffset).toBe(1);
		expect(left[0].shown.day.title).toBe("Today");
		expect(left[2].shown.day.title).not.toBe("Tomorrow");
		expect(left[1].shown.day.title).toBe("Tomorrow");
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
