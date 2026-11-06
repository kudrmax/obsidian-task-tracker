// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../core/application/contracts";
import { markColours, renderTaskCard } from "../../obsidian/ui/TaskCard";
import { TaskList } from "../../obsidian/ui/TaskList";
import { onDay } from "../fakes/itemOnDay";

const item = (extra: Partial<TaskItem> = {}): TaskItem => onDay({
	key: { section: "now", index: 0, path: [], raw: "- [ ] Купить билеты" },
	text: "Купить билеты в Белград",
	status: "todo",
	dueDate: null,
	slot: null,
	reminder: "notification",
	repeat: null,
	open: true,
	repeatable: true,
	priority: null,
	group: null,
	subtasks: [],
	progress: null,
	parentText: null, description: null,
	list: extra.key?.section ?? "now", isSubtask: (extra.key?.path.length ?? 0) > 0, ...extra,
}, "2026-11-01");

describe("renderTaskCard", () => {
	it("puts the subtask counter and the description mark in one column, the mark under the counter", () => {
		const both = renderTaskCard(document.createElement("div"), item({ progress: { done: 1, total: 4 }, description: "- note" }), { day: null });
		const meta = both.querySelector(".tc-meta");
		expect(meta?.classList.contains("is-pair")).toBe(true);
		expect([...meta!.children].map((c) => c.getAttribute("class"))).toEqual(["tc-count", "tc-desc-mark"]);
		expect(meta?.querySelector(".tc-count")?.textContent).toBe("1/4");
	});

	it("shows the mark alone for a task with a description and no subtasks, nothing for a task with neither", () => {
		const alone = renderTaskCard(document.createElement("div"), item({ description: "- note" }), { day: null }).querySelector(".tc-meta");
		expect(alone?.classList.contains("is-pair")).toBe(false);
		expect(alone?.querySelector(".tc-desc-mark")).not.toBeNull();
		expect(alone?.querySelector(".tc-count")).toBeNull();
		expect(renderTaskCard(document.createElement("div"), item(), { day: null }).querySelector(".tc-meta")).toBeNull();
	});

	it("draws the title in a card", () => {
		const parent = document.createElement("div");
		const card = renderTaskCard(parent, item(), { day: null });
		expect(card.parentElement).toBe(parent);
		expect(card.classList.contains("tc-card")).toBe(true);
		expect(card.querySelector(".tc-card-title")?.textContent).toBe("Купить билеты в Белград");
		expect(card.querySelector(".tc-progress-dot")).toBeNull();
		expect(card.querySelector(".tc-due")).toBeNull();
	});

	it("shows each link of the title by its word, the rest as typed", () => {
		const card = renderTaskCard(document.createElement("div"), item({ text: "**Сдать** [[Отчёты/Q4|отчёт]] на https://x.ru" }), { day: null });
		const title = card.querySelector(".tc-card-title")!;
		expect(title.textContent).toBe("**Сдать** отчёт на https://x.ru");
		expect([...title.querySelectorAll(".tc-link")].map((l) => [l.textContent, (l as HTMLElement).dataset.kind, (l as HTMLElement).dataset.target])).toEqual([
			["отчёт", "note", "Отчёты/Q4"],
			["https://x.ru", "url", "https://x.ru"],
		]);
	});

	it("marks a task in progress with the strip", () => {
		const card = renderTaskCard(document.createElement("div"), item({ status: "inProgress" }), { day: null });
		expect(card.querySelector(".tc-progress-dot")).not.toBeNull();
		expect(card.firstElementChild?.classList.contains("tc-progress-dot")).toBe(true);
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

describe("the repeat mark", () => {
	const weekly = { kind: "schedule", every: 1, unit: "week", days: [], dayOfMonth: null, from: null } as TaskItem["repeat"];

	it("sits right after the day, the month under them", () => {
		const card = renderTaskCard(document.createElement("div"), item({ dueDate: "2026-11-05", repeat: weekly }), { day: "2026-11-03" });
		const due = card.querySelector(".tc-due")!;
		expect([...due.children].map((c) => c.className)).toEqual(["tc-due-top", "tc-due-mon"]);
		const top = due.querySelector(".tc-due-top")!;
		expect(top.children[0].className).toBe("tc-due-day");
		expect(top.children[0].textContent).toBe("5");
		expect(top.children[1].classList.contains("tc-due-repeat")).toBe(true);
		expect(top.children[1].tagName.toLowerCase()).toBe("svg");
		expect(due.classList.contains("is-repeat-only")).toBe(false);
	});

	it("is alone in the column when the card shows no date", () => {
		for (const dueDate of ["2026-11-05", null]) {
			const card = renderTaskCard(document.createElement("div"), item({ dueDate, repeat: weekly }), { day: "2026-11-05" });
			const due = card.querySelector(".tc-due")!;
			expect(due.querySelector(".tc-due-day")).toBeNull();
			expect(due.querySelector(".tc-due-mon")).toBeNull();
			expect(due.querySelectorAll(".tc-due-top > .tc-due-repeat")).toHaveLength(1);
			expect(due.classList.contains("is-repeat-only")).toBe(true);
		}
	});

	it("leaves a plain task's markup as it is", () => {
		const card = renderTaskCard(document.createElement("div"), item({ dueDate: "2026-11-05" }), { day: null });
		expect([...card.querySelector(".tc-due")!.children].map((c) => c.className)).toEqual(["tc-due-day", "tc-due-mon"]);
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
		expect([...card.children].map((c) => c.className)).toEqual(["tc-card-title", "tc-meta", "tc-due"]);
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

	it("runs a branch from each task to its subtasks, bending in at the last, and the task's line on past its subtasks' own", () => {
		const sub = (text: string, subtasks: TaskItem[] = []) => item({ text, subtasks, parentText: "p" });
		const tree = [item({ text: "A", subtasks: [sub("A1", [sub("A11"), sub("A12")]), sub("A2", [sub("A21")])] }), item({ text: "B" })];
		const list = new TaskList(document.createElement("div"), { items: () => tree, day: () => null });
		list.render();
		const lines = (card: HTMLElement) => [
			card.querySelector(".tc-branch")?.className ?? null,
			...[...card.querySelectorAll<HTMLElement>(".tc-branch-pass")].map((pass) => pass.style.getPropertyValue("--tc-pass")),
		];
		expect(list.cards.map((e) => [e.item.text, ...lines(e.card)])).toEqual([
			["A", null],
			["A1", "tc-branch"],
			["A11", "tc-branch", "1"],
			["A12", "tc-branch is-last", "1"],
			["A2", "tc-branch is-last"],
			["A21", "tc-branch is-last"],
			["B", null],
		]);
	});
});

describe("a card's colours", () => {
	const RED = { name: "Важное", color: "red" } as const;
	const ORANGE = { name: "Срочное", color: "orange" } as const;
	const attrs = (card: HTMLElement) => [card.dataset.priority, card.dataset.labels, card.getAttribute("data-label0"), card.getAttribute("data-label1")];

	it("tints a card of one colour as a priority, and gives a card of several each colour, up to four", () => {
		const card = document.createElement("div");
		markColours(card, { colors: [RED.color] });
		expect(attrs(card)).toEqual(["red", undefined, null, null]);
		markColours(card, { colors: [RED.color, ORANGE.color] });
		expect(attrs(card)).toEqual(["red", "2", "red", "orange"]);
		markColours(card, { colors: ["red", "orange", "blue", "green", "teal"] });
		expect(card.dataset.labels).toBe("4");
		markColours(card, { colors: [] });
		expect(attrs(card)).toEqual([undefined, undefined, null, null]);
	});
});
