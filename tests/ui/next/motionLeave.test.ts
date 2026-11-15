// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Motion } from "../../../obsidian/ui/next/drivers/motion";

function rooted(): { root: HTMLElement; card: HTMLElement } {
	const root = document.createElement("div");
	root.style.setProperty("--tc-duration-collapse", "200ms");
	const card = document.createElement("div");
	card.dataset.nKey = "a";
	card.dataset.row = "";
	root.appendChild(document.createElement("div")).appendChild(card);
	document.body.appendChild(root);
	return { root, card };
}

describe("a card the drawing took away", () => {
	it("leaves once: a later drawing that moves no rows reports no card leaving", () => {
		const { root, card } = rooted();
		const motion = new Motion(root);
		motion.before(true);
		card.remove();
		motion.after("move", new Map());
		expect(motion.leftCards().map(({ node }) => node)).toEqual([card]);
		motion.after("none", new Map());
		expect(motion.leftCards()).toEqual([]);
	});
});
