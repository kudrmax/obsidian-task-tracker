// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupedList, GroupName, SectionKey, TaskItem } from "../../src/application/contracts";
import type { DragPayload, ListColumn, NewTaskPayload } from "../../src/ui/drag/DropTarget";
import { ListDrop } from "../../src/ui/drag/ListDrop";
import { TaskList } from "../../src/ui/TaskList";

const item = (section: SectionKey, index: number, text: string, group: GroupName): TaskItem => ({
	key: { section, index, path: [], raw: `- [ ] ${text}` },
	text,
	status: "todo",
	dueDate: null,
	slot: null,
	priority: null,
	group,
	subtasks: [],
	progress: null,
	parentText: null, description: null,
});

/** How often each node's place was read: a drag measures a card once. */
const offsetReads = new Map<HTMLElement, number>();

/** The nodes stand `step` apart in the list's content, as the layout puts them, whatever transform they are drawn at. */
function standAt(nodes: readonly HTMLElement[], step: number): void {
	nodes.forEach((node, i) =>
		Object.defineProperties(node, {
			offsetTop: {
				configurable: true,
				get: () => {
					offsetReads.set(node, (offsetReads.get(node) ?? 0) + 1);
					return i * step;
				},
			},
			offsetHeight: { configurable: true, value: 35 },
			offsetLeft: { configurable: true, value: 0 },
			offsetWidth: { configurable: true, value: 175 },
		}),
	);
}

function setup(items: TaskItem[], column: ListColumn, grouped: GroupedList | null, date: string | null = null, onNewPlace = () => undefined) {
	const area = document.createElement("div");
	document.body.appendChild(area);
	const list = new TaskList(document.createElement("div"), {
		items: () => items,
		day: () => null,
		grouped: () => grouped !== null,
		ungroupedName: () => "No section",
	});
	area.appendChild(list.el);
	list.render();
	area.getBoundingClientRect = () => new DOMRect(0, 100, 187, 554);
	list.el.getBoundingClientRect = () => new DOMRect(10, 100, 175, 554);
	standAt(list.elements, 40);
	const drop = new ListDrop(list, area, column, () => true, () => (grouped ? { list: grouped, date } : null), true, onNewPlace);
	return { list, drop };
}

const drag = (from: ListColumn | "timeline", it: TaskItem): DragPayload => ({ item: it, from, durationMin: null, grabPx: 17, grabX: 17 });

describe("ListDrop", () => {
	it("draws a header per group once a list has a section", () => {
		const { list } = setup([item("soon", 0, "A", null), item("soon", 1, "B", "Morning")], "soon", "soon");
		expect(Array.from(list.el.children).map((n) => n.textContent)).toEqual(["No section", "A", "Morning", "B"]);
		expect(list.el.querySelector(".tc-group-head")?.classList.contains("is-ungrouped")).toBe(true);
	});

	it("in a grouped list a card from another column takes a gap", () => {
		const b = item("soon", 1, "B", "Morning");
		const { drop, list } = setup([item("soon", 0, "A", null), b, item("soon", 2, "C", "Morning")], "soon", "soon");
		const from = drag("left", item("now", 0, "N", null));
		drop.preview(50, 100 + 3 * 40 + 2, from);
		expect(list.elements.map((n) => n.classList.contains("is-shifted"))).toEqual([false, false, false, true, true]);
		expect(document.querySelector(".tc-drop-gap")).not.toBeNull();
		expect(drop.drop(50, 100 + 3 * 40 + 2, from)).toEqual({ kind: "group", list: "soon", date: null, group: "Morning", before: b.key });
		drop.clear();
		expect(drop.drop(50, 100 + 5 * 40, from)).toEqual({ kind: "group", list: "soon", date: null, group: "Morning", before: null });
	});

	it("the gap above the first header is the hidden No section", () => {
		const { drop } = setup([item("now", 0, "A", "X")], "left", "now");
		expect(drop.drop(50, 95, drag("soon", item("soon", 0, "S", null)))).toEqual({ kind: "group", list: "now", date: null, group: null, before: null });
	});

	it("the day column of a later day drops into Soon's sections with that day", () => {
		const { drop } = setup([item("soon", 0, "M", "Morning")], "left", "soon", "2026-10-31");
		expect(drop.drop(50, 95, drag("soon", item("soon", 1, "S", null)))).toEqual({ kind: "group", list: "soon", date: "2026-10-31", group: null, before: null });
	});

	it("a finger above the list, over the column's title, still drops into it: on top of the first header", () => {
		const only = item("now", 0, "A", "X");
		const { drop } = setup([only], "left", "now");
		const from = drag("left", only);
		expect(drop.hitTest(50, 60, from)).toBe(true);
		expect(drop.drop(50, 60, from)).toEqual({ kind: "group", list: "now", date: null, group: null, before: null });
		expect(drop.hitTest(50, 20, from)).toBe(false);
	});

	it("Backlog, whose title stands in its own area under Inbox, takes nothing above its area", () => {
		const only = item("backlog", 0, "L", null);
		const { list } = setup([only], "backlog", "backlog");
		const area = list.el.parentElement!;
		const drop = new ListDrop(list, area, "backlog", () => true, () => ({ list: "backlog", date: null }), false);
		const from = drag("inbox", item("inbox", 0, "I", null));
		expect(drop.hitTest(50, 99, from)).toBe(false);
		expect(drop.hitTest(50, 101, from)).toBe(true);
		expect(drop.drop(50, 101, from)).toEqual({ kind: "group", list: "backlog", date: null, group: null, before: only.key });
	});

	it("under the list the column takes nothing", () => {
		const only = item("now", 0, "A", null);
		const { drop, list } = setup([only], "left", "now");
		list.el.getBoundingClientRect = () => new DOMRect(10, 100, 175, 300);
		const from = drag("soon", item("soon", 0, "S", null));
		expect(drop.hitTest(50, 399, from)).toBe(true);
		expect(drop.hitTest(50, 401, from)).toBe(false);
	});

	it("the left column of a past day keeps listBefore", () => {
		const a = item("now", 0, "A", null);
		const { drop } = setup([a, item("now", 1, "B", null)], "left", null);
		expect(drop.drop(50, 101, drag("left", item("now", 1, "B", null)))).toEqual({ kind: "listBefore", before: a.key, column: "left" });
	});

	describe("the left column of a past day, its tasks in sections it does not show", () => {
		const fresh: NewTaskPayload = { from: "new", item: null, durationMin: null, grabPx: 17, grabX: 17 };
		const two = () => [item("now", 0, "A", "Work"), item("now", 1, "B", "Home")];

		it("a new task let go between cards of two sections goes before the one under it", () => {
			const items = two();
			const { drop } = setup(items, "left", null);
			const y = 100 + 40 + 2;
			drop.preview(50, y, fresh);
			const line = drop.landing()!;
			expect(line.height).toBe(0);
			expect(line.top).toBeGreaterThan(135);
			expect(line.top).toBeLessThan(140);
			expect(drop.drop(50, y, fresh)).toEqual({ kind: "listBefore", before: items[1].key, column: "left" });
		});

		it("gives each card the section it is drawn in: none", () => {
			const { list } = setup(two(), "left", null);
			expect(list.listCards.map((card) => card.group)).toEqual([null, null]);
		});
	});

	describe("a new task", () => {
		const fresh: NewTaskPayload = { from: "new", item: null, durationMin: null, grabPx: 17, grabX: 17 };
		const three = () => [item("now", 0, "A", null), item("now", 1, "B", null), item("now", 2, "C", null)];
		const indented = <T extends { list: TaskList }>(made: T): T => {
			made.list.el.style.setProperty("--tc-subtask-indent", "20px");
			return made;
		};

		it("takes a gap anywhere in a list without sections, in a column it is not from: a line shows it, the cards stay", () => {
			const items = three();
			const { drop, list } = setup(items, "soon", null);
			const y = 100 + 2 * 40 + 2;
			drop.preview(50, y, fresh);
			expect(list.elements.map((n) => n.classList.contains("is-shifted"))).toEqual([false, false, false]);
			expect(list.el.querySelector(".tc-list-drop .tc-drop-line")).not.toBeNull();
			expect(drop.drop(50, y, fresh)).toEqual({ kind: "listBefore", before: items[2].key, column: "soon" });
		});

		it("let go between cards with the finger on the list's right half, becomes a subtask of the card above", () => {
			const items = three();
			const { drop } = indented(setup(items, "soon", null));
			expect(drop.drop(150, 100 + 2 * 40 + 2, fresh)).toEqual({ kind: "nest", parent: items[1].key, before: null });
		});

		it("let go with the finger on the list's left half, stays a task", () => {
			const items = three();
			const { drop } = setup(items, "soon", null);
			expect(drop.drop(90, 100 + 2 * 40 + 2, fresh)).toEqual({ kind: "listBefore", before: items[2].key, column: "soon" });
		});

		it("goes a level deeper for each indent the finger stands right of the list's middle (97.5)", () => {
			const a = item("now", 0, "A", null);
			const sub = { ...item("now", 0, "A1", null), key: { section: "now" as const, index: 0, path: [0], raw: "\t- [ ] A1" } };
			const items = [{ ...a, subtasks: [sub] }, item("now", 1, "B", null)];
			const { drop } = indented(setup(items, "soon", null));
			const y = 100 + 2 * 40 - 2;
			expect(drop.drop(105, y, fresh)).toEqual({ kind: "listBefore", before: items[1].key, column: "soon" });
			drop.clear();
			expect(drop.drop(120, y, fresh)).toEqual({ kind: "nest", parent: a.key, before: null });
			drop.clear();
			expect(drop.drop(140, y, fresh)).toEqual({ kind: "nest", parent: sub.key, before: null });
		});

		it("ticks each time the line moves to another gap or level, not while it stays", () => {
			const ticks = vi.fn();
			const { drop } = indented(setup(three(), "soon", null, null, ticks));
			drop.preview(50, 100 + 40 - 2, fresh);
			drop.preview(52, 100 + 40 - 1, fresh);
			expect(ticks).toHaveBeenCalledTimes(1);
			drop.preview(52, 100 + 2 * 40 - 2, fresh);
			expect(ticks).toHaveBeenCalledTimes(2);
			drop.preview(150, 100 + 2 * 40 - 2, fresh);
			expect(ticks).toHaveBeenCalledTimes(3);
		});

		it("goes to the end of a list when let go below its cards", () => {
			const { drop } = setup(three(), "inbox", null);
			expect(drop.drop(50, 100 + 3 * 40 + 10, fresh)).toEqual({ kind: "listBefore", before: null, column: "inbox" });
		});

		it("never goes into a card: over its middle it takes the nearer gap", () => {
			const items = three();
			const { drop } = setup(items, "left", null);
			expect(drop.drop(50, 140 + 17, fresh)).toEqual({ kind: "listBefore", before: items[1].key, column: "left" });
			drop.clear();
			expect(drop.drop(50, 140 + 18, fresh)).toEqual({ kind: "listBefore", before: items[2].key, column: "left" });
		});

		it("takes the gap of a section in a list that shows sections", () => {
			const b = item("soon", 1, "B", "Morning");
			const { drop } = setup([item("soon", 0, "A", null), b], "soon", "soon");
			expect(drop.drop(50, 100 + 3 * 40 + 2, fresh)).toEqual({ kind: "group", list: "soon", date: null, group: "Morning", before: b.key });
		});

		it("is refused by a list that does not accept it", () => {
			const { drop, list } = setup(three(), "left", null);
			const refusing = new ListDrop(list, list.el.parentElement!, "left", (d) => d.from !== "new");
			expect(refusing.hitTest(50, 120, fresh)).toBe(false);
			expect(refusing.drop(50, 120, fresh)).toBeNull();
			expect(drop.hitTest(50, 120, fresh)).toBe(true);
		});
	});

	describe("making room (the owner's decision of 02.11)", () => {
		const STEP = 37;
		const three = () => [item("now", 0, "A", null), item("now", 1, "B", null), item("now", 2, "C", null), item("now", 3, "D", null)];
		const room = (list: TaskList) => list.elements.map((n) => n.style.getPropertyValue("--tc-room"));
		const gapEl = () => document.querySelector<HTMLElement>(".tc-drop-gap");

		/** Cards a step apart, as drawn: the lifted one keeps its place in the layout. */
		function lifted(at: number) {
			const items = three();
			const { list, drop } = setup(items, "left", null);
			standAt(list.elements, STEP);
			list.el.getBoundingClientRect = () => new DOMRect(10, 100, 175, 554);
			list.elements[at].classList.add("is-lifted");
			return { list, drop, items, from: drag("left", items[at]) };
		}

		beforeEach(() => document.body.replaceChildren());
		afterEach(() => {
			document.body.replaceChildren();
			vi.useRealTimers();
		});

		it("keeps the lifted card's place open from the lift, dashed, the other cards where they were", () => {
			const { list, drop, from } = lifted(1);
			drop.preview(10 + 17, 100 + STEP + 17, from);
			expect(room(list)).toEqual(["0px", "0px", "0px", "0px"]);
			expect(list.el.classList.contains("is-making-room")).toBe(true);
			expect(gapEl()?.classList.contains("is-shown")).toBe(true);
			expect(gapEl()?.parentElement).toBe(list.el);
			expect(drop.landing()?.top).toBe(100 + STEP);
		});

		it("moves the room only when the finger picks another gap: the cards step aside by transform, none reflows", () => {
			const { list, drop, from } = lifted(1);
			drop.preview(27, 100 + STEP + 17, from);
			drop.preview(27, 100 + 3 * STEP + 2, from);
			expect(room(list)).toEqual(["0px", "0px", `-${STEP}px`, "0px"]);
			expect(list.elements[1].classList.contains("is-lifted")).toBe(true);
		});

		it("keeps the room where it is while the finger is over a card: the card under it does not slide away", () => {
			const { list, drop, from } = lifted(1);
			drop.preview(27, 100 + STEP + 17, from);
			const before = room(list);
			drop.preview(27, 100 + 2 * STEP + 17, from);
			expect(list.elements[2].classList.contains("is-target")).toBe(true);
			expect(room(list)).toEqual(before);
			expect(gapEl()?.classList.contains("is-shown")).toBe(false);
			drop.preview(27, 100 + 2 * STEP + 18, from);
			expect(list.elements[2].classList.contains("is-target")).toBe(true);
		});

		it("keeps the lifted card's place open, dashed, while the finger is outside the list (the owner's decision of 02.11)", () => {
			const { list, drop, from } = lifted(1);
			drop.preview(27, 100 + 3 * STEP + 2, from);
			drop.leave();
			expect(room(list)).toEqual(["0px", "0px", "0px", "0px"]);
			expect(gapEl()?.classList.contains("is-shown")).toBe(true);
			expect(gapEl()?.style.transform).toBe(`translate3d(0px, ${STEP}px, 0)`);
			drop.preview(27, 100 + STEP + 17, from);
			expect(drop.landing()?.top).toBe(100 + STEP);
		});

		it("let go at the place it was lifted from, the card only goes back: nothing to write", () => {
			const { drop, from } = lifted(1);
			drop.preview(27, 100 + 3 * STEP + 2, from);
			drop.leave();
			drop.preview(27, 100 + STEP + 17, from);
			expect(drop.drop(27, 100 + STEP + 17, from)).toBeNull();
			drop.preview(27, 100 + 3 * STEP + 2, from);
			expect(drop.drop(27, 100 + 3 * STEP + 2, from)).not.toBeNull();
		});

		it("a list nothing was lifted from closes when the finger leaves it", () => {
			vi.useFakeTimers();
			const { list, drop, from } = lifted(1);
			list.elements[1].classList.remove("is-lifted");
			drop.preview(27, 100 + 2 * STEP + 2, from);
			drop.leave();
			expect(room(list)).toEqual(["", "", "", ""]);
			vi.runAllTimers();
			expect(gapEl()).toBeNull();
		});

		it("closes over the lifted card when the drag is over, and stands as drawn once the card is back", () => {
			vi.useFakeTimers();
			const { list, drop, from } = lifted(1);
			drop.preview(27, 100 + STEP + 17, from);
			drop.clear();
			expect(room(list)).toEqual(["0px", "0px", `-${STEP}px`, `-${STEP}px`]);
			vi.runAllTimers();
			expect(gapEl()).toBeNull();
			list.elements[1].classList.remove("is-lifted");
			drop.clear();
			expect(room(list)).toEqual(["", "", "", ""]);
			expect(list.el.classList.contains("is-making-room")).toBe(false);
		});

		it("writes the room only into the cards whose room changed", () => {
			const { list, drop, from } = lifted(1);
			drop.preview(27, 100 + STEP + 17, from);
			const sets = list.elements.map((node) => vi.spyOn(node.style, "setProperty"));
			const roomed = () => sets.filter((set) => set.mock.calls.some(([name]) => name === "--tc-room")).length;
			drop.preview(27, 100 + 3 * STEP + 2, from);
			expect(roomed()).toBe(1);
			for (const set of sets) set.mockClear();
			drop.preview(27, 100 + 3 * STEP + 3, from);
			expect(roomed()).toBe(0);
			for (const set of sets) set.mockRestore();
		});

		it("marks as moved only the cards drawn off their place", () => {
			const { list, drop, from } = lifted(1);
			drop.preview(27, 100 + 3 * STEP + 2, from);
			const rooms = room(list);
			expect(list.elements.map((n) => n.classList.contains("is-moved"))).toEqual(rooms.map((value) => value !== "0px"));
			expect(list.elements[0].classList.contains("is-moved")).toBe(false);
			expect(list.elements[1].classList.contains("is-moved")).toBe(false);
			expect(list.elements[2].classList.contains("is-moved")).toBe(true);
		});

		it("stands as drawn after the drag: no room and no mark left", () => {
			const { list, drop, from } = lifted(1);
			drop.preview(27, 100 + 3 * STEP + 2, from);
			list.elements[1].classList.remove("is-lifted");
			drop.clear();
			expect(list.elements.some((n) => n.classList.contains("is-moved"))).toBe(false);
			expect(room(list)).toEqual(["", "", "", ""]);
		});

		it("scrolls the list under a finger held near its bottom edge, the place following", () => {
			const frames: (() => void)[] = [];
			vi.stubGlobal("requestAnimationFrame", (fn: () => void) => frames.push(fn));
			const { list, drop, from } = lifted(1);
			let scrollTop = 0;
			Object.defineProperty(list.el, "scrollTop", { get: () => scrollTop, set: (v: number) => (scrollTop = v) });
			drop.preview(27, 100 + 554 - 60, from);
			drop.preview(27, 100 + 554 - 2, from);
			expect(frames.length).toBe(1);
			frames.shift()!();
			expect(scrollTop).toBeGreaterThan(0);
			expect(frames.length).toBe(1);
			drop.clear();
			vi.unstubAllGlobals();
		});
	});

	describe("measuring once (block 3)", () => {
		const thirty = () => Array.from({ length: 30 }, (_, i) => item("now", i, `T${i}`, null));
		function liftedOf30(at: number) {
			const items = thirty();
			const made = setup(items, "left", null);
			made.list.elements[at].classList.add("is-lifted");
			return { ...made, from: drag("left", items[at]) };
		}

		afterEach(() => {
			vi.restoreAllMocks();
			document.body.replaceChildren();
		});

		it("measures each card once over a whole drag: 50 moves read no card's rect and no computed style", () => {
			const { list, drop, from } = liftedOf30(3);
			const rect = vi.spyOn(Element.prototype, "getBoundingClientRect");
			const style = vi.spyOn(window, "getComputedStyle");
			offsetReads.clear();
			for (let i = 0; i < 50; i++) drop.preview(27, 140 + i * 8, from);
			const nodes = new Set<unknown>(list.elements);
			expect(rect.mock.contexts.filter((self) => nodes.has(self))).toEqual([]);
			expect(style.mock.calls.length).toBeLessThanOrEqual(1);
			const standing = list.elements.filter((node) => !node.classList.contains("is-lifted"));
			expect(standing.map((node) => offsetReads.get(node))).toEqual(standing.map(() => 1));
		});

		it("reads the list's own rect once per move", () => {
			const { list, drop, from } = liftedOf30(3);
			const box = vi.fn(() => new DOMRect(10, 100, 175, 554));
			list.el.getBoundingClientRect = box;
			for (let i = 0; i < 50; i++) drop.preview(27, 140 + i * 8, from);
			expect(box).toHaveBeenCalledTimes(50);
		});

		it("follows a scroll by scrollTop, not by measuring again", () => {
			const { list, drop, from } = liftedOf30(29);
			let scrollTop = 0;
			Object.defineProperty(list.el, "scrollTop", { configurable: true, get: () => scrollTop, set: (v: number) => (scrollTop = v) });
			const y = 100 + 5 * 40 + 17;
			drop.preview(27, y, from);
			expect(list.elements[5].classList.contains("is-target")).toBe(true);
			offsetReads.clear();
			scrollTop = 40;
			drop.preview(27, y, from);
			expect(list.elements[6].classList.contains("is-target")).toBe(true);
			expect(list.elements[5].classList.contains("is-target")).toBe(false);
			expect(offsetReads.size).toBe(0);
		});

		it("measures again once the list is drawn anew", () => {
			const { list, drop, from } = liftedOf30(29);
			drop.preview(27, 300, from);
			list.render();
			standAt(list.elements, 40);
			offsetReads.clear();
			drop.preview(27, 302, from);
			expect(offsetReads.size).toBe(list.elements.length);
		});
	});
});
