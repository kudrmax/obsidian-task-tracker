// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ScrollEdges } from "../../obsidian/ui/ScrollEdges";
import { CARD_HEIGHTS } from "../../core/application/contracts";

function scroller(scrollHeight: number, clientHeight: number): HTMLElement {
	const el = document.createElement("div");
	Object.defineProperty(el, "scrollHeight", { get: () => scrollHeight });
	Object.defineProperty(el, "clientHeight", { get: () => clientHeight });
	return el;
}

function edgesOf(el: HTMLElement): string[] {
	return ["is-under-top", "is-under-bottom"].filter((name) => el.classList.contains(name));
}

describe("ScrollEdges", () => {
	it("a list at its top with more below fades only at the bottom", () => {
		const el = scroller(1000, 400);
		new ScrollEdges(el).update();
		expect(edgesOf(el)).toEqual(["is-under-bottom"]);
	});

	it("a scrolled list fades at the top, and at the bottom while content goes on below", () => {
		const el = scroller(1000, 400);
		const edges = new ScrollEdges(el);
		el.scrollTop = 300;
		edges.update();
		expect(edgesOf(el)).toEqual(["is-under-top", "is-under-bottom"]);
		el.scrollTop = 600;
		el.dispatchEvent(new Event("scroll"));
		expect(edgesOf(el)).toEqual(["is-under-top"]);
	});

	it("a list that fits shows no fade", () => {
		const el = scroller(400, 400);
		new ScrollEdges(el).update();
		expect(edgesOf(el)).toEqual([]);
	});

	it("stops following the scroll once destroyed", () => {
		const el = scroller(1000, 400);
		const edges = new ScrollEdges(el);
		edges.destroy();
		el.scrollTop = 300;
		el.dispatchEvent(new Event("scroll"));
		expect(edgesOf(el)).toEqual([]);
	});
});

describe("ScrollEdges: how deep each fade is", () => {
	it("grows with the content under each edge, held past the tallest card", () => {
		const el = scroller(1000, 400);
		const edges = new ScrollEdges(el);
		const depths = [0, 1, 5, 20, 300, 600].map((top) => {
			el.scrollTop = top;
			edges.update();
			return [el.style.getPropertyValue("--tc-scrolled"), el.style.getPropertyValue("--tc-scrolled-below")];
		});
		const max = `${CARD_HEIGHTS.max}px`;
		expect(depths).toEqual([["0px", max], ["1px", max], ["5px", max], ["20px", max], [max, max], [max, "0px"]]);
	});
});
