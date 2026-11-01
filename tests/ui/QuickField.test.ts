// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import type { PriorityLevel } from "../../src/settings";
import type { PendingText } from "../../src/ui/quick/QuickEntry";
import { QuickField, type QuickKey } from "../../src/ui/quick/QuickField";
import { TaskList } from "../../src/ui/TaskList";
import { fakeTitleField } from "../fakes/FakeTitleField";

const URGENT: PriorityLevel = { prefix: "p1", color: "red" };
const LATER: PriorityLevel = { prefix: "p2", color: "blue" };

function open(value = "", priority: PriorityLevel | null = null, select = false) {
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	const keys: QuickKey[] = [];
	const texts: string[] = [];
	const priorities: (PriorityLevel | null)[] = [];
	let blurs = 0;
	const handle = QuickField.open(parent, {
		value,
		select,
		priority,
		levels: [URGENT, LATER],
		titleField: fakeTitleField,
		onInput: (t) => texts.push(t),
		onPriority: (p) => priorities.push(p),
		onKey: (k) => keys.push(k),
		onBlur: () => blurs++,
	});
	const field = handle.el as HTMLTextAreaElement;
	const type = (text: string) => {
		field.value = text;
		field.dispatchEvent(new Event("input", { bubbles: true }));
	};
	return { handle, field, keys, texts, priorities, type, blurs: () => blurs };
}

const press = (field: HTMLElement, init: KeyboardEventInit) => {
	const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
	field.dispatchEvent(e);
	return e;
};

describe("QuickField", () => {
	it("is the title field, marked as the quick field, with the hint of a new task", () => {
		const { field, handle } = open("a");
		expect(field.classList.contains("tc-quick-field")).toBe(true);
		expect(field.placeholder).toBe("New task");
		expect(handle.text).toBe("a");
	});

	it("maps Enter, Escape, Tab and Shift+Tab to keys, and keeps them from the page", () => {
		const { field, keys } = open();
		const seen: string[] = [];
		document.body.addEventListener("keydown", (e) => seen.push(e.key));
		const events = [press(field, { key: "Enter" }), press(field, { key: "Escape" }), press(field, { key: "Tab" }), press(field, { key: "Tab", shiftKey: true })];
		expect(keys).toEqual(["enter", "escape", "tab", "shiftTab"]);
		expect(events.map((e) => e.defaultPrevented)).toEqual([true, true, true, true]);
		expect(seen).toEqual([]);
	});

	it("leaves other keys alone", () => {
		const { field, keys } = open();
		expect(press(field, { key: "a" }).defaultPrevented).toBe(false);
		expect(keys).toEqual([]);
	});

	it("ignores keys while an input method is composing", () => {
		const { field, keys } = open();
		const tab = press(field, { key: "Tab", isComposing: true });
		const enter = press(field, { key: "Enter", isComposing: true });
		expect(keys).toEqual([]);
		expect([tab.defaultPrevented, enter.defaultPrevented]).toEqual([false, false]);
	});

	it("ignores the key that commits an input method's candidate on iOS", () => {
		const { field, keys } = open();
		const enter = press(field, { key: "Enter", keyCode: 229 });
		expect(keys).toEqual([]);
		expect(enter.defaultPrevented).toBe(false);
	});

	it("takes a text set from outside, its prefix reported again only when typed over", () => {
		const { handle, field, priorities, type } = open("p1 buy", URGENT);
		handle.setValue("");
		expect(field.value).toBe("");
		type("p1 milk");
		expect(priorities).toEqual([URGENT]);
	});

	it("reports the text as typed, and a blur", () => {
		const { field, texts, type, blurs } = open();
		type("p1 buy milk");
		field.dispatchEvent(new FocusEvent("blur"));
		expect(texts).toEqual(["p1 buy milk"]);
		expect(blurs()).toBe(1);
	});

	it("never takes a line break: a pasted one becomes a space", () => {
		const { field, texts, type } = open();
		type("buy\nmilk");
		expect(field.value).toBe("buy milk");
		expect(texts).toEqual(["buy milk"]);
	});

	describe("priority from the prefix", () => {
		it("takes the colour of the level whose prefix and a space start the text, and says so once", () => {
			const { field, priorities, type } = open();
			type("p1");
			expect(field.hasAttribute("data-priority")).toBe(false);
			type("p1 ");
			type("p1 buy");
			expect(field.dataset.priority).toBe("red");
			expect(priorities).toEqual([URGENT]);
			type("p2 buy");
			expect(field.dataset.priority).toBe("blue");
			expect(priorities).toEqual([URGENT, LATER]);
		});

		it("lets go of the colour when the prefix goes, leaving the text as typed", () => {
			const { field, priorities, type } = open();
			type("p1 buy");
			type("p1buy");
			expect(field.hasAttribute("data-priority")).toBe(false);
			expect(field.value).toBe("p1buy");
			expect(priorities).toEqual([URGENT, null]);
		});

		it("says nothing for a text with no prefix on a field whose level was chosen elsewhere", () => {
			const { field, priorities, type, handle } = open("", null);
			handle.setPriority(LATER);
			type("buy");
			expect(field.dataset.priority).toBe("blue");
			expect(priorities).toEqual([]);
		});

		it("starts with the level given, and does not announce a prefix it already had", () => {
			const { field, priorities, type } = open("p1 buy", URGENT);
			expect(field.dataset.priority).toBe("red");
			type("p1 buy milk");
			expect(priorities).toEqual([]);
		});
	});

	it("selects the whole value on focus for a rename, and puts the caret at the end otherwise", () => {
		const rename = open("Buy milk", null, true);
		rename.handle.focus();
		expect([rename.field.selectionStart, rename.field.selectionEnd]).toEqual([0, 8]);
		const fresh = open("Buy milk");
		fresh.handle.focus();
		expect([fresh.field.selectionStart, fresh.field.selectionEnd]).toEqual([8, 8]);
		expect(fresh.handle.focused).toBe(true);
	});

	it("gives the focus back with the selection as it was", () => {
		const { handle, field } = open("Buy milk");
		field.focus();
		field.setSelectionRange(2, 5);
		field.blur();
		handle.refocus();
		expect(handle.focused).toBe(true);
		expect([field.selectionStart, field.selectionEnd]).toEqual([2, 5]);
	});

	it("goes, its field with it", () => {
		const { handle, field } = open("Buy milk");
		handle.destroy();
		expect(field.isConnected).toBe(false);
	});
});

const item = (text: string, subtasks: TaskItem[] = []): TaskItem => ({
	key: { section: "now", index: 0, path: [], raw: `- [ ] ${text}` },
	text,
	status: "todo",
	dueDate: null,
	slot: null,
	priority: null,
	group: null,
	subtasks,
	progress: null,
	parentText: null,
});

describe("TaskList with a task being typed", () => {
	const list = (items: TaskItem[], index: number, level: number, pending: PendingText[] = [{ text: "Milk", level }]) => {
		const l = new TaskList(document.createElement("div"), {
			items: () => items,
			day: () => null,
			entry: () => ({
				place: { kind: "gap", index, level, group: null },
				pending,
				field: (parent) => QuickField.open(parent, { value: "", select: false, levels: [], priority: null, titleField: fakeTitleField, onInput() {}, onPriority() {}, onKey() {}, onBlur() {} }).el,
			}),
		});
		l.render();
		return l;
	};

	it("draws the cards, the typed texts and the field in that order, at the level of the place", () => {
		const l = list([item("A"), item("B")], 1, 1);
		const rows = [...l.el.children] as HTMLElement[];
		expect(rows.map((r) => r.className)).toEqual(["tc-card", "tc-card", "tc-quick-row", "tc-card"]);
		expect(rows[1].textContent).toBe("Milk");
		expect(rows[2].querySelector("textarea")).not.toBeNull();
		expect(rows.slice(1, 3).map((r) => r.style.getPropertyValue("--tc-level"))).toEqual(["1", "1"]);
		expect(l.cards.map((e) => e.item.text)).toEqual(["A", "B"]);
	});

	it("shows a link in a typed text by its word, as a card does", () => {
		const l = list([item("A")], 1, 0, [{ text: "Call [[People/Pete|Pete]]", level: 0 }]);
		const typed = l.el.children[1];
		expect(typed.textContent).toBe("Call Pete");
		expect(typed.querySelector(".tc-link")?.textContent).toBe("Pete");
	});

	it("draws several typed texts before the field", () => {
		const l = list([item("A")], 1, 0, [
			{ text: "x", level: 0 },
			{ text: "y", level: 0 },
		]);
		expect([...l.el.children].map((r) => r.textContent || r.className)).toEqual(["A", "x", "y", "tc-quick-row"]);
	});

	it("draws each typed text at its own level, its branches from those levels", () => {
		const l = list([item("A")], 1, 1, [
			{ text: "P", level: 0 },
			{ text: "c1", level: 1 },
		]);
		const [, p, c1, field] = [...l.el.children] as HTMLElement[];
		expect([p, c1, field].map((r) => r.style.getPropertyValue("--tc-level"))).toEqual(["0", "1", "1"]);
		expect(p.querySelector(".tc-branch")).toBeNull();
		expect(c1.querySelector(".tc-branch")?.className).toBe("tc-branch");
		expect(field.querySelector(".tc-branch")?.className).toBe("tc-branch is-last");
	});

	it("counts the rows for the branches of the cards around them", () => {
		const l = list([item("A", [item("A1")]), item("B")], 2, 1);
		const [a, a1, milk, field] = [...l.el.children] as HTMLElement[];
		expect(a.querySelector(".tc-branch")).toBeNull();
		expect(a1.querySelector(".tc-branch")?.className).toBe("tc-branch");
		expect(milk.querySelector(".tc-branch")?.className).toBe("tc-branch");
		expect(field.querySelector(".tc-branch")?.className).toBe("tc-branch is-last");
	});

	it("runs a task's line on past a deeper row", () => {
		const l = list([item("A", [item("A1"), item("A2")])], 2, 2, []);
		const row = l.el.querySelector(".tc-quick-row")!;
		expect(row.querySelector(".tc-branch")?.className).toBe("tc-branch is-last");
		expect([...row.querySelectorAll<HTMLElement>(".tc-branch-pass")].map((p) => p.style.getPropertyValue("--tc-pass"))).toEqual(["1"]);
	});

	it("hides the card the field renames, and its branches pass it by: the field on the last subtask bends in", () => {
		const keyed = (text: string, path: number[]): TaskItem => ({ ...item(text), key: { section: "now", index: 0, path, raw: text } });
		const last = keyed("A2", [1]);
		const l = new TaskList(document.createElement("div"), {
			items: () => [{ ...keyed("A", []), subtasks: [keyed("A1", [0]), last] }],
			day: () => null,
			entry: () => ({ place: { kind: "gap", index: 2, level: 1, group: null }, pending: [], renaming: last.key, field: (parent) => parent }),
		});
		l.render();
		const [, a1, field, hidden] = [...l.el.children] as HTMLElement[];
		expect(hidden.classList.contains("is-renaming")).toBe(true);
		expect(a1.querySelector(".tc-branch")?.className).toBe("tc-branch");
		expect(field.querySelector(".tc-branch")?.className).toBe("tc-branch is-last");
		expect(l.cards.map((e) => e.item.text)).toEqual(["A", "A1", "A2"]);
	});

	it("stands at the end of the list for a place past the last card", () => {
		const l = list([item("A")], 1, 0);
		expect([...l.el.children].map((r) => r.className)).toEqual(["tc-card", "tc-card", "tc-quick-row"]);
	});

	it("stands at the end of its own section for a place past that section's cards", () => {
		const grouped = [{ ...item("A"), group: "Home" }, { ...item("B"), group: "Work" }];
		const l = new TaskList(document.createElement("div"), {
			items: () => grouped,
			day: () => null,
			grouped: () => true,
			entry: () => ({ place: { kind: "gap", index: 2, level: 0, group: "Home" }, pending: [], field: (parent) => parent }),
		});
		l.render();
		expect([...l.el.children].map((r) => r.className)).toEqual(["tc-group-head", "tc-card", "tc-quick-row", "tc-group-head", "tc-card"]);
	});

	it("keeps the field's row, and the field in it, across a redraw", () => {
		let field: HTMLTextAreaElement | null = null;
		const items = [item("A")];
		const l = new TaskList(document.createElement("div"), {
			items: () => items,
			day: () => null,
			entry: () => ({
				place: { kind: "gap", index: items.length, level: 0, group: null },
				pending: [],
				field: (parent) => {
					field ??= document.createElement("textarea");
					if (field.parentElement !== parent) parent.appendChild(field);
					return field;
				},
			}),
		});
		l.render();
		const row = l.el.querySelector(".tc-quick-row");
		items.unshift(item("Z"));
		l.render();
		expect(l.el.querySelector(".tc-quick-row")).toBe(row);
		expect(row!.querySelectorAll("textarea").length).toBe(1);
		expect([...l.el.children].map((r) => r.textContent || r.className)).toEqual(["Z", "A", "tc-quick-row"]);
	});

	it("stands in its section when the list has headers", () => {
		const grouped = [{ ...item("A"), group: "Home" }, { ...item("B"), group: "Work" }];
		const l = new TaskList(document.createElement("div"), {
			items: () => grouped,
			day: () => null,
			grouped: () => true,
			entry: () => ({ place: { kind: "gap", index: 1, level: 0, group: "Work" }, pending: [], field: (parent) => parent }),
		});
		l.render();
		expect([...l.el.children].map((r) => r.className)).toEqual(["tc-group-head", "tc-card", "tc-group-head", "tc-quick-row", "tc-card"]);
	});
});
