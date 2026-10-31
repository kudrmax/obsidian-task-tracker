// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { renderTaskCard } from "../../src/ui/TaskCard";
import { TaskList } from "../../src/ui/TaskList";

const item = (extra: Partial<TaskItem> = {}): TaskItem => ({
	key: { section: "now", index: 0, path: [], raw: "- [ ] Купить билеты" },
	text: "Купить билеты в Белград",
	status: "todo",
	dueDate: null,
	slot: null,
	priority: null,
	subtasks: [],
	progress: null,
	parentText: null,
	...extra,
});

describe("renderTaskCard", () => {
	it("draws the title in a card", () => {
		const parent = document.createElement("div");
		const card = renderTaskCard(parent, item(), { day: null });
		expect(card.parentElement).toBe(parent);
		expect(card.classList.contains("tc-card")).toBe(true);
		expect(card.querySelector(".tc-card-title")?.textContent).toBe("Купить билеты в Белград");
		expect(card.querySelector(".tc-strip")).toBeNull();
		expect(card.querySelector(".tc-due")).toBeNull();
	});

	it("marks a task in progress with the strip", () => {
		const card = renderTaskCard(document.createElement("div"), item({ status: "inProgress" }), { day: null });
		expect(card.querySelector(".tc-strip")).not.toBeNull();
		expect(card.firstElementChild?.classList.contains("tc-strip")).toBe(true);
	});

	it("shows the due date as the day over the month, in capitals", () => {
		const card = renderTaskCard(document.createElement("div"), item({ dueDate: "2026-11-03" }), { day: null });
		expect(card.querySelector(".tc-due-day")?.textContent).toBe("3");
		expect(card.querySelector(".tc-due-mon")?.textContent).toBe("NOV");
	});

	it("leaves out a due date on the day the card is shown on", () => {
		const card = renderTaskCard(document.createElement("div"), item({ dueDate: "2026-11-03" }), { day: "2026-11-03" });
		expect(card.querySelector(".tc-due")).toBeNull();
	});

	it("shows a due date on another day than the card's", () => {
		const card = renderTaskCard(document.createElement("div"), item({ dueDate: "2026-11-03" }), { day: "2026-10-31" });
		expect(card.querySelector(".tc-due")).not.toBeNull();
	});
});

describe("a task's priority", () => {
	it("marks the card with the level's colour, and a card without one with nothing", () => {
		const tinted = renderTaskCard(document.createElement("div"), item({ priority: { prefix: "p1", color: "red" } }), { day: null });
		expect(tinted.dataset.priority).toBe("red");
		expect(tinted.querySelector(".tc-card-title")?.textContent).toBe("Купить билеты в Белград");
		expect(renderTaskCard(document.createElement("div"), item(), { day: null }).hasAttribute("data-priority")).toBe(false);
	});
});

describe("a task with subtasks", () => {
	it("shows the counter before the due date, and nothing without subtasks", () => {
		const card = renderTaskCard(document.createElement("div"), item({ progress: { done: 2, total: 5 }, dueDate: "2026-11-03" }), { day: null });
		expect([...card.children].map((c) => c.className)).toEqual(["tc-card-title", "tc-count", "tc-due"]);
		expect(card.querySelector(".tc-count")?.textContent).toBe("2/5");
		expect(renderTaskCard(document.createElement("div"), item(), { day: null }).querySelector(".tc-count")).toBeNull();
	});

	it("lists the subtasks right under their task, a level further in, and hands each task its subtree", () => {
		const sub = (text: string, subtasks: TaskItem[] = []) => item({ text, subtasks, parentText: "p" });
		const tree = [item({ text: "A", subtasks: [sub("A1", [sub("A11")]), sub("A2")] }), item({ text: "B" })];
		const subtrees = new Map<string, string[]>();
		const list = new TaskList(document.createElement("div"), {
			items: () => tree,
			day: () => null,
			onCard: (_card, task, subtree) => subtrees.set(task.text, subtree.map((c) => c.textContent ?? "")),
		});
		list.render();
		expect(list.cards.map((e) => [e.item.text, e.level, e.card.style.getPropertyValue("--tc-level")])).toEqual([
			["A", 0, "0"],
			["A1", 1, "1"],
			["A11", 2, "2"],
			["A2", 1, "1"],
			["B", 0, "0"],
		]);
		expect(subtrees.get("A")).toEqual(["A1", "A11", "A2"]);
		expect(subtrees.get("A1")).toEqual(["A11"]);
		expect(subtrees.get("B")).toEqual([]);
	});
});
