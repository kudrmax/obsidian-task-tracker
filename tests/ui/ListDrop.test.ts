// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupedList, GroupName, SectionKey, TaskItem } from "../../src/application/contracts";
import type { DragPayload, ListColumn, NewTaskPayload } from "../../src/ui/drag/DropTarget";
import { ListDrop } from "../../src/ui/drag/ListDrop";
import { TaskList } from "../../src/ui/TaskList";
import { shownCardSize } from "../../src/ui/cardSize";

const item = (section: SectionKey, index: number, text: string, group: GroupName): TaskItem => ({
	key: { section, index, path: [], raw: `- [ ] ${text}` },
	text,
	status: "todo",
	dueDate: null,
	slot: null,
	reminder: "notification",
	repeat: null,
	open: true,
	repeatable: true,
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

const drag = (from: ListColumn | "timeline", it: TaskItem): DragPayload => ({ item: it, from, durationMin: null, grabPx: 17 });

/** The finger holding a carried card by 17 px so that the card picks the place at `y`: its middle. */
const picking = (y: number) => y + 17 - shownCardSize().height / 2;

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
		drop.preview(50, picking(100 + 3 * 40 + 2), from);
		expect(list.elements.map((n) => n.style.transform)).toEqual(["", "", "", "", ""]);
		expect(list.el.querySelector(".tc-list-drop.is-shown .tc-drop-line")).not.toBeNull();
		expect(drop.drop(50, picking(100 + 3 * 40 + 2), from)).toEqual({ kind: "group", list: "soon", date: null, group: "Morning", before: b.key });
		drop.clear();
		expect(drop.drop(50, picking(100 + 5 * 40), from)).toEqual({ kind: "group", list: "soon", date: null, group: "Morning", before: null });
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
		const fresh: NewTaskPayload = { from: "new", item: null, durationMin: null, grabPx: 17 };
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
		const fresh: NewTaskPayload = { from: "new", item: null, durationMin: null, grabPx: 17 };
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
			expect(list.elements.map((n) => n.style.transform)).toEqual(["", "", ""]);
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

	describe("a task carried: its place waits dashed, the cards stay, the drop line shows where it goes; the card's middle picks the place", () => {
		const STEP = 37;
		const four = () => [item("now", 0, "A", null), item("now", 1, "B", null), item("now", 2, "C", null), item("now", 3, "D", null)];
		const lineEl = () => document.querySelector<HTMLElement>(".tc-list-drop");

		/** Cards a step apart, as drawn: the lifted one waits where it stood, a dashed place as tall as a card. */
		function lifted(at: number) {
			const items = four();
			const { list, drop } = setup(items, "left", null);
			list.el.style.setProperty("--tc-subtask-indent", "20px");
			standAt(list.elements, STEP);
			list.el.getBoundingClientRect = () => new DOMRect(10, 100, 175, 554);
			list.elements[at].classList.add("is-lifted", "is-waiting");
			return { list, drop, items, from: drag("left", items[at]) };
		}

		beforeEach(() => document.body.replaceChildren());
		afterEach(() => document.body.replaceChildren());

		it("over the place it was lifted from shows no line: the dashed place says it stays", () => {
			const { drop, from } = lifted(1);
			drop.preview(27, picking(100 + STEP + 17), from);
			expect(lineEl()).toBeNull();
			expect(drop.landing()?.top).toBe(100 + STEP);
			expect(drop.drop(27, picking(100 + STEP + 17), from)).toBeNull();
		});

		it("between two other cards draws the line in their gap; no card moves", () => {
			const { list, drop, items, from } = lifted(1);
			drop.preview(27, picking(100 + 3 * STEP + 2), from);
			expect(lineEl()?.classList.contains("is-shown")).toBe(true);
			expect(lineEl()?.parentElement).toBe(list.el);
			const top = Number(/, ([\d.]+)px, 0\)$/.exec(lineEl()!.style.transform)![1]);
			expect(top).toBeGreaterThan(2 * STEP + 35);
			expect(top).toBeLessThanOrEqual(3 * STEP);
			expect(list.elements.map((n) => n.style.transform)).toEqual(["", "", "", ""]);
			expect(list.elements[1].classList.contains("is-waiting")).toBe(true);
			expect(drop.drop(27, picking(100 + 3 * STEP + 2), from)).toEqual({ kind: "listBefore", before: items[3].key, column: "left" });
		});

		it("lands where the card will stand once its dashed place above has gone", () => {
			const { drop, from } = lifted(1);
			drop.preview(27, picking(100 + 3 * STEP + 2), from);
			expect(drop.landing()?.top).toBe(100 + 3 * STEP - STEP);
		});

		it("the line stands in the gap nearest the carried card's middle", () => {
			const { list, drop, from } = lifted(1);
			const finger = 100 + 3 * STEP + 30;
			const middle = finger - 17 + shownCardSize().height / 2;
			drop.preview(27, finger, from);
			const lineTop = Number(/, ([\d.]+)px, 0\)$/.exec(lineEl()!.style.transform)![1]) + list.el.getBoundingClientRect().top;
			expect(Math.abs(lineTop - middle)).toBeLessThanOrEqual(STEP / 2);
		});

		it("the card's middle over a card's upper half puts it before that card", () => {
			const { drop, items, from } = lifted(0);
			expect(drop.drop(27, picking(100 + 2 * STEP + 8), from)).toEqual({ kind: "listBefore", before: items[2].key, column: "left" });
		});

		it("never goes into a card: over its middle the line stands in the gap nearer, the card unlit", () => {
			const { list, drop, items, from } = lifted(1);
			drop.preview(27, picking(100 + 2 * STEP + 26), from);
			expect(list.elements.some((node) => node.classList.contains("is-target"))).toBe(false);
			expect(lineEl()).not.toBeNull();
			expect(drop.drop(27, picking(100 + 2 * STEP + 26), from)).toEqual({ kind: "listBefore", before: items[3].key, column: "left" });
		});

		it("takes its level from the list's middle (97.5), as a new task does, wherever the card is held", () => {
			const { drop, items, from } = lifted(3);
			const y = picking(100 + 2 * STEP + 2);
			expect(drop.drop(90, y, from)).toEqual({ kind: "listBefore", before: items[2].key, column: "left" });
			drop.clear();
			expect(drop.drop(118, y, from)).toEqual({ kind: "nest", parent: items[1].key, before: null });
		});

		it("at its own place a level deeper, the line stands in the gap over the dashed place, never on it", () => {
			const { list, drop, items, from } = lifted(1);
			drop.preview(118, picking(100 + STEP + 17), from);
			const [, right, y] = /translate3d\(([\d.]+)px, ([\d.]+)px, 0\)/.exec(lineEl()!.style.transform)!.map(Number);
			expect(y).toBe(STEP - (STEP - 35) / 2);
			expect(right - parseFloat(list.el.querySelector<HTMLElement>(".tc-list-drop-bar")!.style.width)).toBe(20);
			expect(drop.drop(118, picking(100 + STEP + 17), from)).toEqual({ kind: "nest", parent: items[0].key, before: null });
		});

		it("a new level moves the line's left end only: its right end, where it hangs, stays", () => {
			const { drop, from } = lifted(1);
			drop.preview(27, picking(100 + 3 * STEP + 2), from);
			const before = lineEl()!.style.transform;
			drop.preview(118, picking(100 + 3 * STEP + 2), from);
			expect(lineEl()!.style.transform).toBe(before);
		});

		it("the finger gone from the list takes the line away; the dashed place waits", () => {
			const { list, drop, from } = lifted(1);
			drop.preview(27, picking(100 + 3 * STEP + 2), from);
			drop.leave();
			expect(lineEl()).toBeNull();
			expect(list.elements[1].classList.contains("is-waiting")).toBe(true);
			drop.preview(27, picking(100 + 3 * STEP + 2), from);
			expect(lineEl()).not.toBeNull();
			drop.clear();
			expect(lineEl()).toBeNull();
		});

		it("several cards carried: let go at the place of one of them, they still move there", () => {
			const { list, drop, items } = lifted(1);
			list.elements[3].classList.add("is-lifted", "is-waiting");
			const many: DragPayload = { item: items[1], from: "left", durationMin: null, grabPx: 17, carried: [{ item: items[3], from: "left" }] };
			drop.preview(27, picking(100 + STEP + 17), many);
			expect(lineEl()).not.toBeNull();
			expect(drop.drop(27, picking(100 + STEP + 17), many)).toEqual({ kind: "listBefore", before: items[2].key, column: "left" });
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
			for (let i = 0; i < 50; i++) drop.preview(27, picking(140 + i * 8), from);
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
			for (let i = 0; i < 50; i++) drop.preview(27, picking(140 + i * 8), from);
			expect(box).toHaveBeenCalledTimes(50);
		});

		it("follows a scroll by scrollTop, not by measuring again", () => {
			const { list, drop, from } = liftedOf30(29);
			let scrollTop = 0;
			Object.defineProperty(list.el, "scrollTop", { configurable: true, get: () => scrollTop, set: (v: number) => (scrollTop = v) });
			const y = 100 + 5 * 40 + 17;
			const lineY = () => Number(/, ([\d.]+)px, 0\)$/.exec(document.querySelector<HTMLElement>(".tc-list-drop")!.style.transform)![1]);
			drop.preview(27, picking(y), from);
			const before = lineY();
			offsetReads.clear();
			scrollTop = 40;
			drop.preview(27, picking(y), from);
			expect(lineY()).toBe(before + 40);
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
