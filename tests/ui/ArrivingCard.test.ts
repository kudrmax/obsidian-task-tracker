// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { TaskItem } from "../../core/application/contracts";
import { ArrivingCard } from "../../obsidian/ui/drag/ArrivingCard";

const task = (raw: string, index = 0) => ({ key: { section: "now", index, path: [], raw } }) as unknown as TaskItem;
const key = (raw: string, index = 0) => task(raw, index).key;

function drawn(): HTMLElement {
	return document.body.appendChild(document.createElement("div"));
}

describe("ArrivingCard", () => {
	afterEach(() => document.body.replaceChildren());

	it("hides the dropped task's card as drawn, and gives it", () => {
		const arriving = new ArrivingCard();
		arriving.expect(key("- [ ] A", 3));
		const other = drawn();
		const card = drawn();
		arriving.attach(other, task("- [ ] A", 2));
		arriving.attach(card, task("- [ ] A", 3));
		expect(arriving.shown).toBe(card);
		expect(card.classList.contains("is-arriving")).toBe(true);
		expect(other.classList.contains("is-arriving")).toBe(false);
	});

	it("follows a redraw while the float flies: the new card is the one hidden and given", () => {
		const arriving = new ArrivingCard();
		arriving.expect(key("- [ ] A"));
		const first = drawn();
		arriving.attach(first, task("- [ ] A"));
		first.remove();
		const redrawn = drawn();
		arriving.attach(redrawn, task("- [ ] A"));
		expect(arriving.shown).toBe(redrawn);
	});

	it("shows the card again once landed, and hides no later drawing", () => {
		const arriving = new ArrivingCard();
		arriving.expect(key("- [ ] A"));
		const card = drawn();
		arriving.attach(card, task("- [ ] A"));
		arriving.arrived();
		expect(card.classList.contains("is-arriving")).toBe(false);
		const later = drawn();
		arriving.attach(later, task("- [ ] A"));
		expect(later.classList.contains("is-arriving")).toBe(false);
		expect(arriving.shown).toBeNull();
	});

	it("gives no card when the drop gave no task", () => {
		const arriving = new ArrivingCard();
		arriving.expect(null);
		arriving.attach(drawn(), task("- [ ] A"));
		expect(arriving.shown).toBeNull();
	});
});
