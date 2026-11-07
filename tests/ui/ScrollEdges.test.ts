// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ScrollEdges } from "../../obsidian/ui/ScrollEdges";

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
