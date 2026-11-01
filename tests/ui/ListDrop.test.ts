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

function setup(items: TaskItem[], column: ListColumn, grouped: GroupedList | null, date: string | null = null) {
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
	list.elements.forEach((node, i) => (node.getBoundingClientRect = () => new DOMRect(10, 100 + i * 40, 175, 35)));
	const drop = new ListDrop(list, area, column, () => true, () => (grouped ? { list: grouped, date } : null));
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
			expect(drop.landing()?.top).toBe(140);
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

		it("takes a gap anywhere in a list without sections, in a column it is not from", () => {
			const items = three();
			const { drop, list } = setup(items, "soon", null);
			const y = 100 + 2 * 40 + 2;
			drop.preview(50, y, fresh);
			expect(list.elements.map((n) => n.classList.contains("is-shifted"))).toEqual([false, false, true]);
			expect(document.querySelector(".tc-drop-gap")).not.toBeNull();
			expect(drop.drop(50, y, fresh)).toEqual({ kind: "listBefore", before: items[2].key, column: "soon" });
		});

		it("goes to the end of a list when let go below its cards", () => {
			const { drop } = setup(three(), "inbox", null);
			expect(drop.drop(50, 100 + 3 * 40 + 10, fresh)).toEqual({ kind: "listBefore", before: null, column: "inbox" });
		});

		it("goes into the card under the middle of it as a subtask", () => {
			const items = three();
			const { drop } = setup(items, "left", null);
			expect(drop.drop(50, 140 + 17, fresh)).toEqual({ kind: "nest", parent: items[1].key, before: null });
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
			list.elements.forEach((node, i) => (node.getBoundingClientRect = () => new DOMRect(10, 100 + i * STEP, 175, 35)));
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

		it("closes over the lifted card when the finger leaves the list, and stands as drawn once the card is back", () => {
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

		it("scrolls the list under a finger held near its bottom edge, the place following", () => {
			const frames: (() => void)[] = [];
			vi.stubGlobal("requestAnimationFrame", (fn: () => void) => frames.push(fn));
			const { list, drop, from } = lifted(1);
			let scrollTop = 0;
			Object.defineProperty(list.el, "scrollTop", { get: () => scrollTop, set: (v: number) => (scrollTop = v) });
			drop.preview(27, 100 + 554 - 2, from);
			expect(frames.length).toBe(1);
			frames.shift()!();
			expect(scrollTop).toBeGreaterThan(0);
			expect(frames.length).toBe(1);
			drop.clear();
			vi.unstubAllGlobals();
		});
	});
});
