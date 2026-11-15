// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PAGE_SCRIPT } from "../../scripts/e2e/page";

/**
 * The recorder's row keys (`scripts/e2e/page.ts`) as the page computes them: the view's own key where it gives one, each
 * element keeping its key from frame to frame (rows of one title never swap numbers as they move), a remounted row
 * taking its key back, a title never cut.
 */

interface E2E {
	rows(): { key: string }[];
	keyAt(selector: string): string | null;
}

const page = () => (window as unknown as { __e2e: E2E }).__e2e;

let restore: () => void;

beforeEach(() => {
	const original = Element.prototype.getBoundingClientRect;
	Element.prototype.getBoundingClientRect = function (this: Element) {
		const y = Number((this as HTMLElement).dataset.y ?? 0);
		const r = this.classList.contains("task-calendar") ? { x: 0, y: 0, width: 400, height: 800 } : { x: 10, y, width: 200, height: 30 };
		return { ...r, left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height, toJSON: () => r } as DOMRect;
	};
	restore = () => {
		Element.prototype.getBoundingClientRect = original;
	};
	document.body.innerHTML = `<div class="task-calendar"><div class="tc-left"><div class="tc-list"></div></div></div>`;
	new Function(PAGE_SCRIPT)();
});

afterEach(() => restore());

const list = () => document.querySelector(".tc-list")!;
const card = (title: string, y: number, data: Record<string, string> = {}) => {
	const el = document.createElement("div");
	el.className = "tc-card";
	el.dataset.y = String(y);
	for (const [k, v] of Object.entries(data)) el.dataset[k] = v;
	el.innerHTML = `<span class="tc-card-title">${title}</span>`;
	list().appendChild(el);
	return el;
};

describe("the recorder's row keys", () => {
	it("keeps each of two rows of one title on its own key as they swap places", () => {
		const a = card("Same", 0);
		const b = card("Same", 40);
		expect(page().rows().map((r) => r.key)).toEqual(["Same/1", "Same/2"]);
		list().insertBefore(b, a);
		b.dataset.y = "0";
		a.dataset.y = "40";
		expect(page().rows().map((r) => r.key)).toEqual(["Same/2", "Same/1"]);
	});

	it("takes the view's own key where it gives one, the model's row key first", () => {
		card("Same", 0, { card: "t1" });
		card("Same", 40, { row: "r7", card: "t2" });
		expect(page().rows().map((r) => r.key)).toEqual(["t1/1", "r7/1"]);
	});

	it("gives a remounted row its key back", () => {
		const a = card("Call", 0, { card: "t1" });
		expect(page().rows().map((r) => r.key)).toEqual(["t1/1"]);
		a.remove();
		expect(page().rows()).toEqual([]);
		card("Call", 0, { card: "t1" });
		expect(page().rows().map((r) => r.key)).toEqual(["t1/1"]);
	});

	it("never cuts a title: two long titles alike in their first 60 characters are two rows", () => {
		const head = "x".repeat(70);
		card(`${head} one`, 0);
		card(`${head} two`, 40);
		expect(page().rows().map((r) => r.key)).toEqual([`${head} one/1`, `${head} two/1`]);
	});

	it("names the row a step carries by the key the frames give it", () => {
		card("Same", 0);
		card("Same", 40);
		page().rows();
		expect(page().keyAt(".tc-card:nth-child(2)")).toBe("Same/2");
	});
});
