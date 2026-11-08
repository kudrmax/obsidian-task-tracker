// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { TaskItem } from "../../core/application/contracts";
import { ArrivingCard } from "../../obsidian/ui/drag/ArrivingCard";

const task = (id: string, raw = `- [ ] ${id}`) => ({ id, key: { section: "now", index: 0, path: [], raw } }) as unknown as TaskItem;

function drawn(): HTMLElement {
	return document.body.appendChild(document.createElement("div"));
}

describe("ArrivingCard", () => {
	afterEach(() => document.body.replaceChildren());

	it("hides the dropped task's card, known by its id from before the write, whatever its line becomes, and gives it", () => {
		const arriving = new ArrivingCard();
		arriving.dropping(task("t7"));
		const other = drawn();
		const card = drawn();
		arriving.attach(other, task("t8"));
		arriving.attach(card, task("t7", "- [ ] moved 📅 2026-11-09"));
		expect(arriving.shown).toBe(card);
		expect(card.classList.contains("is-arriving")).toBe(true);
		expect(other.classList.contains("is-arriving")).toBe(false);
	});

	it("follows a redraw while the float flies: the new card is the one hidden and given", () => {
		const arriving = new ArrivingCard();
		arriving.dropping(task("t7"));
		const first = drawn();
		arriving.attach(first, task("t7"));
		first.remove();
		const redrawn = drawn();
		arriving.attach(redrawn, task("t7"));
		expect(arriving.shown).toBe(redrawn);
	});

	it("shows the card again once landed, and hides no later drawing", () => {
		const arriving = new ArrivingCard();
		arriving.dropping(task("t7"));
		const card = drawn();
		arriving.attach(card, task("t7"));
		arriving.arrived();
		expect(card.classList.contains("is-arriving")).toBe(false);
		const later = drawn();
		arriving.attach(later, task("t7"));
		expect(later.classList.contains("is-arriving")).toBe(false);
		expect(arriving.shown).toBeNull();
	});
});
