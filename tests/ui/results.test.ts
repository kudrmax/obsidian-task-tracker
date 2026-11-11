// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResultPage, TaskItem } from "../../core/application/contracts";
import { taskMenu } from "../../core/application/menus";
import { resultChooser } from "../../obsidian/ui/menu/ResultChooser";
import { editRows } from "../../obsidian/ui/menu/TaskMenu";
import { blockMenuTask, cardMenuTask, renderTaskCard } from "../../obsidian/ui/TaskCard";
import { onDay } from "../fakes/itemOnDay";

const item = (text: string, extra: Partial<TaskItem> = {}): TaskItem =>
	onDay({ key: { section: "now", index: 0, path: [], raw: `- [ ] ${text}` }, text, status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: "now", isSubtask: false, ...extra }, "2026-11-01");

const step = item("Write to Marko");
/** A folded result whose card shows its next step, as the core reads it. */
const folded = item("Company", { isResult: true, collapsed: true, subtasks: [step], card: { text: "Write to Marko", title: "Write to Marko", over: "Company", step, semibold: false }, block: { text: "Write to Marko", title: "Write to Marko", step } });

afterEach(() => document.body.replaceChildren());

describe("a folded result's card", () => {
	it("draws the result's own title small over the step's", () => {
		const card = renderTaskCard(document.body, folded, { day: null });
		expect(card.classList.contains("is-two-line")).toBe(true);
		expect(card.querySelector(".tc-card-over")?.textContent).toBe("Company");
		expect(card.querySelector(".tc-card-over svg")).not.toBeNull();
		expect(card.querySelector(".tc-card-lines > .tc-card-title")?.textContent).toBe("Write to Marko");
	});

	it("draws a result with its own title in semibold, on one line", () => {
		const own = item("Trip", { isResult: true, card: { text: "Trip", title: "Trip", over: null, step: null, semibold: true } });
		const card = renderTaskCard(document.body, own, { day: null });
		expect(card.classList.contains("is-two-line")).toBe(false);
		expect(card.classList.contains("is-result")).toBe(true);
		expect(card.querySelector(":scope > .tc-card-title")?.textContent).toBe("Trip");
	});

	it("draws the task's own title where the search asks for it", () => {
		const card = renderTaskCard(document.body, folded, { day: null, own: true });
		expect(card.querySelector(".tc-card-over")).toBeNull();
		expect(card.querySelector(":scope > .tc-card-title")?.textContent).toBe("Company");
		expect(card.classList.contains("is-result")).toBe(true);
	});

	it("opens the result's menu from its small line and the step's from anywhere else", () => {
		const card = renderTaskCard(document.body, folded, { day: null });
		expect(cardMenuTask(folded, card.querySelector(".tc-card-over-text"))).toBe(folded);
		expect(cardMenuTask(folded, card.querySelector(".tc-card-title"))).toBe(step);
		expect(cardMenuTask(folded, card)).toBe(step);
		expect(cardMenuTask(step, null)).toBe(step);
	});

	it("opens the step's menu from the timeline's block", () => {
		expect(blockMenuTask(folded)).toBe(step);
		expect(blockMenuTask(step)).toBe(step);
	});
});

describe("the result rows", () => {
	it("stand right after Project, as the model has them", () => {
		const task = item("A");
		const model = taskMenu([task], "2026-11-01", [], [], null, { kind: "task", from: "day" });
		const ids = editRows(task, model).map((row) => row.id);
		expect(ids.slice(ids.indexOf("project"), ids.indexOf("project") + 3)).toEqual(["project", "addToResult", "toggle"]);
		const rows = editRows(task, model);
		expect(rows.find((row) => row.id === "toggle")?.label).toBe(model.result.toggle.label);
		expect(rows.find((row) => row.id === "addToResult")).toMatchObject({ label: model.result.label, value: model.result.value, icon: "target" });
	});
});

describe("the Add to result page", () => {
	const ref = (title: string) => ({ id: title, key: { section: "now" as const, index: 0, path: [], raw: title }, title });
	const page = (titles: readonly string[]): ResultPage => ({
		options: titles.map((title, i) => ({ result: ref(title), list: i === 0 ? "now" : "soon", project: i === 0 ? "Serbia" : null, checked: i === 0 })),
		placeholder: "Search results",
		newLabel: "New result…",
		namePlaceholder: "Result name",
	});

	it("draws the search, each result with its place, its project and the tick, and New result… last", () => {
		const panel = document.body.appendChild(document.createElement("div"));
		resultChooser(panel, { title: "Add to result", page: page(["Company", "Move"]), onBack: vi.fn(), find: vi.fn(), onPick: vi.fn(), onNew: vi.fn(), onChange: vi.fn() });
		expect(panel.querySelector<HTMLInputElement>(".tc-search-input")?.placeholder).toBe("Search results");
		const rows = [...panel.querySelectorAll(".tc-result-option")];
		expect(rows.map((row) => row.querySelector(".tc-result-title")?.textContent)).toEqual(["Company", "Move"]);
		expect(rows.map((row) => row.querySelector(".tc-result-project")?.textContent ?? null)).toEqual(["Serbia", null]);
		expect(rows.map((row) => row.querySelector(".tc-result-check") !== null)).toEqual([true, false]);
		expect(panel.lastElementChild?.textContent).toBe("New result…");
	});

	it("asks the core again as the query changes, and picks what it then shows", async () => {
		const panel = document.body.appendChild(document.createElement("div"));
		const find = vi.fn(async () => page(["Move"]));
		const onPick = vi.fn();
		const onChange = vi.fn();
		resultChooser(panel, { title: "Add to result", page: page(["Company", "Move"]), onBack: vi.fn(), find, onPick, onNew: vi.fn(), onChange });
		const input = panel.querySelector<HTMLInputElement>(".tc-search-input")!;
		input.value = "mo";
		input.dispatchEvent(new Event("input"));
		await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
		expect(find).toHaveBeenCalledWith("mo");
		expect([...panel.querySelectorAll(".tc-result-title")].map((t) => t.textContent)).toEqual(["Move"]);
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(onPick).toHaveBeenCalledWith(ref("Move").key);
	});
});
