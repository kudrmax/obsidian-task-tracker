// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyedRows } from "../../../obsidian/ui/motion/KeyedRows";

interface Played {
	readonly node: Element;
	readonly keyframes: Keyframe[];
	readonly options: KeyframeAnimationOptions;
}

let played: Played[] = [];

beforeEach(() => {
	played = [];
	const values: Record<string, string> = { "--tc-duration-collapse": "150", "--tc-ease-out": "ease-out", height: "35px", minHeight: "0px", marginTop: "0px", marginBottom: "0px", rowGap: "0px", transform: "none" };
	vi.spyOn(window, "getComputedStyle").mockImplementation(
		() => new Proxy({} as CSSStyleDeclaration, { get: (_, key) => (key === "getPropertyValue" ? (name: string) => values[name] ?? "" : (values[key as string] ?? "")) }),
	);
	HTMLElement.prototype.animate = function (this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
		played.push({ node: this, keyframes, options });
		return { playState: "running", currentTime: 0, effect: { getTiming: () => options }, addEventListener: () => undefined, cancel: () => undefined } as unknown as Animation;
	} as HTMLElement["animate"];
});

afterEach(() => {
	vi.restoreAllMocks();
	delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
	document.body.replaceChildren();
});

function draw(rows: KeyedRows, keys: readonly string[], moving = true): Map<string, HTMLElement> {
	const drawing = rows.begin(moving);
	const make = (key: string) => () => {
		const node = document.createElement("div");
		if (key.startsWith("card")) node.className = "tc-card";
		if (key.startsWith("head")) node.className = "tc-group-head";
		return node;
	};
	const nodes = new Map(keys.map((key) => [key, drawing.take(key, make(key)).node]));
	drawing.finish();
	return nodes;
}

const growthOf = (node: Element) => played.find((p) => p.node === node && (p.keyframes[0] as Keyframe).height === "0px");

describe("a row coming in while others of its column go", () => {
	it("the No tasks plate waits while a list's last cards fade and grows as they fold: never on top of them (Subprojects off)", () => {
		const rows = new KeyedRows(document.body.appendChild(document.createElement("div")));
		draw(rows, ["card a", "card b"], false);
		const plate = draw(rows, ["empty"]).get("empty")!;
		const growth = growthOf(plate);
		expect(growth?.options.delay).toBeCloseTo(150, 0);
		expect(growth?.options.duration).toBe(150);
		expect(growth?.options.fill).toBe("backwards");
	});

	it("grows at once when nothing of its column leaves", () => {
		const rows = new KeyedRows(document.body.appendChild(document.createElement("div")));
		draw(rows, ["card a"], false);
		const b = draw(rows, ["card a", "card b"]).get("card b")!;
		expect(growthOf(b)?.options.delay).toBe(0);
	});

	it("grows at once when only a mark leaves: a mark folds without fading", () => {
		const rows = new KeyedRows(document.body.appendChild(document.createElement("div")));
		const first = rows.begin(false);
		first.takeMark("drop", () => document.createElement("div"));
		first.finish();
		const card = draw(rows, ["card"]).get("card")!;
		expect(growthOf(card)?.options.delay).toBe(0);
	});

	it("grows at once under a card that stays, though a row in place fades: only a row in place waits (as the app)", () => {
		const rows = new KeyedRows(document.body.appendChild(document.createElement("div")));
		draw(rows, ["card a", "card b"], false);
		const c = draw(rows, ["card b", "card c"]).get("card c")!;
		expect(growthOf(c)?.options.delay).toBe(0);
	});

	it("grows at once in place when the rows going fade under a card", () => {
		const rows = new KeyedRows(document.body.appendChild(document.createElement("div")));
		draw(rows, ["card a", "card b", "head x"], false);
		const first = draw(rows, ["card new", "card a", "head x"]).get("card new")!;
		expect(growthOf(first)?.options.delay).toBe(0);
	});

	it("a row in place after a header waits while the section's cards in place fade", () => {
		const rows = new KeyedRows(document.body.appendChild(document.createElement("div")));
		draw(rows, ["head x", "card a"], false);
		const plate = draw(rows, ["head x", "plate x"]).get("plate x")!;
		expect(growthOf(plate)?.options.delay).toBeCloseTo(150, 0);
	});
});

describe("a row coming in place where rows of an earlier drawing still fade", () => {
	it("waits only what is left of their fade: a typed text's card comes as its field folds (Rows: a draft saved by a tap elsewhere)", () => {
		let now = 1000;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const rows = new KeyedRows(document.body.appendChild(document.createElement("div")));
		draw(rows, ["field"], false);
		draw(rows, ["empty"]);
		now = 1024;
		const card = draw(rows, ["card typed"]).get("card typed")!;
		expect(growthOf(card)?.options.delay).toBe(126);
	});
});
