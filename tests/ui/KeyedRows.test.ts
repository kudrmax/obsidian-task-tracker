// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { TaskItem } from "../../core/application/contracts";
import { KeyedRows } from "../../obsidian/ui/motion/KeyedRows";
import { TaskList } from "../../obsidian/ui/TaskList";
import { Timeline } from "../../obsidian/ui/Timeline";
import { DayBoundary } from "../../core/application/contracts";
import { onDay } from "../fakes/itemOnDay";
import { withShownSpan } from "../fakes/timelineDeps";

const task = (text: string, id: string, extra: Partial<TaskItem> = {}): TaskItem => ({
	...onDay({ key: { section: "now", index: 0, path: [], raw: `- [ ] ${text}` }, text, status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, group: null, subtasks: [], progress: null, parentText: null, description: null, list: "now", isSubtask: false }, "2026-11-01"),
	id,
	...extra,
});

afterEach(() => document.body.replaceChildren());

describe("a list's rows live as long as their tasks", () => {
	it("keeps a task's card through a write that changes its line, filled anew in place", () => {
		let items = [task("A", "1"), task("B", "2")];
		const list = new TaskList(document.body.appendChild(document.createElement("div")), { items: () => items, day: () => null });
		list.render();
		const [a, b] = list.cards.map((entry) => entry.card);
		items = [task("A done", "1"), task("B", "2")];
		list.render();
		expect(list.cards.map((entry) => entry.card)).toEqual([a, b]);
		expect(a.textContent).toContain("A done");
	});

	it("moves the same card to a task's new place, and draws a new one only for a new task", () => {
		let items = [task("A", "1"), task("B", "2")];
		const list = new TaskList(document.body.appendChild(document.createElement("div")), { items: () => items, day: () => null });
		list.render();
		const [a, b] = list.cards.map((entry) => entry.card);
		items = [task("B", "2"), task("C", "3"), task("A", "1")];
		list.render();
		const cards = list.cards.map((entry) => entry.card);
		expect([cards[0], cards[2]]).toEqual([b, a]);
		expect([a, b]).not.toContain(cards[1]);
		expect([...list.el.children]).toEqual(cards);
	});

	it("hangs a card's listeners on a signal the next drawing aborts, so none is heard twice", () => {
		let items = [task("A", "1")];
		const signals: AbortSignal[] = [];
		const list = new TaskList(document.body.appendChild(document.createElement("div")), { items: () => items, day: () => null, onCard: (_card, _item, _subtree, signal) => signals.push(signal) });
		list.render();
		items = [task("A!", "1")];
		list.render();
		expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
	});

	it("gives a text typed the task its write answered, by that key, and no other task that comes meanwhile", () => {
		let items: TaskItem[] = [task("A", "1")];
		let pending = [{ text: "Bread", level: 0 }];
		const list = new TaskList(document.body.appendChild(document.createElement("div")), {
			items: () => items,
			day: () => null,
			entry: () => ({ at: { kind: "top" }, level: 0, pending, field: (row) => row }),
		});
		list.render();
		const typed = list.el.querySelector(".tc-card:not(.tc-quick-row)")!;
		expect(typed.textContent).toBe("Bread");
		const bread = task("Bread", "9");
		list.adopt(bread.key);
		pending = [];
		items = [task("Synced", "5"), bread, task("A", "1")];
		list.render();
		const cards = list.cards.map((entry) => entry.card);
		expect(cards[1]).toBe(typed);
		expect(cards[0]).not.toBe(typed);
	});

	it("keeps a section's header through a rename", () => {
		let name = "Morning";
		const list = new TaskList(document.body.appendChild(document.createElement("div")), {
			items: () => [task("A", "1")],
			day: () => null,
			grouped: () => true,
			sections: () => [
				{ id: "none", name: null, empty: false },
				{ id: "s1", name, empty: true },
			],
		});
		list.render();
		const head = () => [...list.el.querySelectorAll(".tc-group-head")].find((h) => !h.classList.contains("is-ungrouped"));
		const morning = head();
		name = "Evening";
		list.render();
		expect(head()).toBe(morning);
		expect(morning?.textContent).toBe("Evening");
	});
});

describe("the rows of a column drawn by key", () => {
	it("never moves the row that holds the focus: the others are put around it", () => {
		const host = document.body.appendChild(document.createElement("div"));
		const rows = new KeyedRows(host);
		const draw = (keys: string[]) => {
			const drawing = rows.begin(false);
			for (const key of keys) drawing.take(key, () => document.createElement("div")).node.dataset.key = key;
			drawing.finish();
		};
		draw(["a", "field", "b"]);
		const field = rows.nodeOf("field")!;
		const input = field.appendChild(document.createElement("input"));
		input.focus();
		draw(["b", "a", "field"]);
		expect([...host.children].map((child) => (child as HTMLElement).dataset.key)).toEqual(["b", "a", "field"]);
		expect(document.activeElement).toBe(input);
	});

	it("lets a new key take over the row of its heir: a text typed stays the same card once written", () => {
		const host = document.body.appendChild(document.createElement("div"));
		const rows = new KeyedRows(host);
		let drawing = rows.begin(false);
		const typed = drawing.take("unwritten:0", () => document.createElement("div")).node;
		drawing.finish();
		drawing = rows.begin(false);
		const written = drawing.take("task:9", () => document.createElement("div"), "unwritten:0");
		drawing.finish();
		expect(written).toMatchObject({ node: typed, fresh: false });
		expect(typed.isConnected).toBe(true);
	});

	it("leaves alone what else stands in the column, as a section's landing mark", () => {
		const host = document.body.appendChild(document.createElement("div"));
		const rows = new KeyedRows(host);
		let drawing = rows.begin(false);
		const a = drawing.take("a", () => document.createElement("div")).node;
		const b = drawing.take("b", () => document.createElement("div")).node;
		drawing.finish();
		const mark = document.createElement("div");
		b.before(mark);
		drawing = rows.begin(false);
		drawing.take("a", () => document.createElement("div"));
		drawing.take("b", () => document.createElement("div"));
		drawing.finish();
		expect([...host.children]).toEqual([a, mark, b]);
	});
});

describe("the timeline's blocks live as long as their tasks", () => {
	it("keeps a task's block, on the page, through a redraw", () => {
		const slot = { date: "2026-10-30", start: 600, end: 660 };
		let tasks = [task("Call", "7", { slot })];
		const view = new Timeline(document.body.appendChild(document.createElement("div")), withShownSpan({
			theme: () => "dark",
			date: () => "2026-10-30",
			isToday: () => false,
			boundary: () => DayBoundary.MIDNIGHT,
			hourPx: () => 56,
			tasks: () => tasks,
			events: () => [],
			now: () => new Date(2026, 9, 31, 12, 0),
		}));
		view.render();
		const block = view.itemsEl.querySelector(".tc-block");
		tasks = [task("Call back", "7", { slot: { ...slot, start: 630, end: 690 } })];
		view.render();
		expect(view.itemsEl.querySelector(".tc-block")).toBe(block);
		expect(block?.isConnected).toBe(true);
		expect(block?.textContent).toContain("Call back");
	});
});
