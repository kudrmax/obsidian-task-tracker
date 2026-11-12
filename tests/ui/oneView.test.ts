// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CarryReport } from "../../obsidian/ui/projects/CarryReport";
import { TaskList } from "../../obsidian/ui/TaskList";
import { PROJECTS_HOVER_MS } from "../../core/application/contracts";

describe("a carrying finger told to the core's carry (spec decision 39)", () => {
	afterEach(() => vi.useRealTimers());

	it("tells the core where the finger is only when that changes, and again once the core's wait is up", async () => {
		vi.useFakeTimers();
		const root = document.createElement("div");
		const told: { edge: boolean; node: string | null }[] = [];
		let changed = 0;
		const report = new CarryReport({
			tasks: { carryAt: async (at) => (told.push(at), { wait: told.length === 1 ? PROJECTS_HOVER_MS : null }) },
			root: () => root,
			tree: () => null,
			now: () => 0,
			changed: async () => void changed++,
			onError: (e) => {
				throw e;
			},
		});
		report.move(5, 100);
		report.move(6, 120);
		await vi.advanceTimersByTimeAsync(0);
		expect(told).toEqual([{ edge: true, node: null }]);
		await vi.advanceTimersByTimeAsync(PROJECTS_HOVER_MS);
		expect(told).toHaveLength(2);
		report.move(200, 100);
		await vi.advanceTimersByTimeAsync(0);
		expect(told[2]).toEqual({ edge: false, node: null });
		expect(changed).toBe(3);
		report.end();
	});
});

describe("an empty list's plate (spec decision 18)", () => {
	it("draws «No tasks» where a list draws nothing and its owner asks for it, a tap typing at the end", () => {
		let words: string | null = "No tasks";
		let typed = 0;
		const list = new TaskList(document.createElement("div"), { items: () => [], day: () => null, empty: () => words, onEmpty: () => typed++ });
		list.render(false);
		const plate = list.el.querySelector<HTMLElement>(".tc-list-empty");
		expect(plate?.textContent).toBe("No tasks");
		plate!.click();
		expect(typed).toBe(1);
		expect(list.elements).toEqual([]);
		words = null;
		list.render(false);
		expect(list.el.querySelector(".tc-list-empty")).toBeNull();
	});
});
