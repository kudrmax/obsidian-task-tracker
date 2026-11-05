// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { BulkMenu, type BulkActions } from "../../src/ui/menu/BulkMenu";

const item = (index: number): TaskItem => ({
	key: { section: "now", index, path: [], raw: `- [ ] T${index}` },
	text: `T${index}`,
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
	parentText: null,
	description: null,
});

describe("BulkMenu (block 3)", () => {
	afterEach(() => {
		vi.useRealTimers();
		document.body.replaceChildren();
	});

	it("measures every picked card before it lifts any", () => {
		vi.useFakeTimers();
		const lifted: number[] = [];
		const cards = Array.from({ length: 5 }, (_, i) => {
			const card = document.body.appendChild(document.createElement("div"));
			card.getBoundingClientRect = () => {
				lifted.push(document.querySelectorAll(".tc-lifted").length);
				return new DOMRect(10, 100 + i * 40, 175, 35);
			};
			return card;
		});
		const done = async () => undefined;
		const actions: BulkActions = { setStatus: done, setPriority: done, postpone: done, removeDue: done, toSection: done, remove: done };
		BulkMenu.open({ items: cards.map((_, i) => item(i)), cards, source: cards[0], today: "2026-11-04", day: "2026-11-04", levels: [], actions, onClose: () => {} });
		expect(lifted.length).toBeGreaterThanOrEqual(5);
		expect(lifted.every((count) => count === 0)).toBe(true);
		expect(document.querySelectorAll(".tc-lifted").length).toBe(5);
	});
});
