// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { FoundCard } from "../../src/ui/FoundCard";

const task = (raw: string, index = 0) => ({ key: { section: "soon", index, path: [], raw } }) as unknown as TaskItem;

describe("FoundCard", () => {
	it("rings the found task's card, and its new card after a redraw", () => {
		const found = new FoundCard();
		found.mark(task("- [ ] A"));
		const first = document.createElement("div");
		const other = document.createElement("div");
		found.attach(first, task("- [ ] A"));
		found.attach(other, task("- [ ] B", 1));
		expect(first.classList.contains("is-found")).toBe(true);
		expect(other.classList.contains("is-found")).toBe(false);
		const redrawn = document.createElement("div");
		found.attach(redrawn, task("- [ ] A"));
		expect(redrawn.classList.contains("is-found")).toBe(true);
	});

	it("lets go on a tap: no card wears the ring, and no later drawing either", () => {
		const found = new FoundCard();
		found.mark(task("- [ ] A"));
		const card = document.createElement("div");
		found.attach(card, task("- [ ] A"));
		found.clear();
		expect(card.classList.contains("is-found")).toBe(false);
		const later = document.createElement("div");
		found.attach(later, task("- [ ] A"));
		expect(later.classList.contains("is-found")).toBe(false);
		expect(found.active).toBe(false);
	});
});
