// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { renderTaskCard } from "../../src/ui/TaskCard";

const item = (extra: Partial<TaskItem> = {}): TaskItem => ({
	key: { section: "now", index: 0, raw: "- [ ] Купить билеты" },
	text: "Купить билеты в Белград",
	status: "todo",
	dueDate: null,
	slot: null,
	priority: null,
	...extra,
});

describe("renderTaskCard", () => {
	it("draws the title in a card", () => {
		const parent = document.createElement("div");
		const card = renderTaskCard(parent, item(), { showDue: true });
		expect(card.parentElement).toBe(parent);
		expect(card.classList.contains("tc-card")).toBe(true);
		expect(card.querySelector(".tc-card-title")?.textContent).toBe("Купить билеты в Белград");
		expect(card.querySelector(".tc-strip")).toBeNull();
		expect(card.querySelector(".tc-due")).toBeNull();
	});

	it("marks a task in progress with the strip", () => {
		const card = renderTaskCard(document.createElement("div"), item({ status: "inProgress" }), { showDue: true });
		expect(card.querySelector(".tc-strip")).not.toBeNull();
		expect(card.firstElementChild?.classList.contains("tc-strip")).toBe(true);
	});

	it("shows the due date as the day over the month, in capitals", () => {
		const card = renderTaskCard(document.createElement("div"), item({ dueDate: "2026-11-03" }), { showDue: true });
		expect(card.querySelector(".tc-due-day")?.textContent).toBe("3");
		expect(card.querySelector(".tc-due-mon")?.textContent).toBe("NOV");
	});

	it("hides the due date in a narrow column", () => {
		const card = renderTaskCard(document.createElement("div"), item({ dueDate: "2026-11-03" }), { showDue: false });
		expect(card.querySelector(".tc-due")).toBeNull();
	});
});

describe("a task's priority", () => {
	it("marks the card with the level's colour, and a card without one with nothing", () => {
		const tinted = renderTaskCard(document.createElement("div"), item({ priority: { prefix: "p1", color: "red" } }), { showDue: true });
		expect(tinted.dataset.priority).toBe("red");
		expect(tinted.querySelector(".tc-card-title")?.textContent).toBe("Купить билеты в Белград");
		expect(renderTaskCard(document.createElement("div"), item(), { showDue: true }).hasAttribute("data-priority")).toBe(false);
	});
});
