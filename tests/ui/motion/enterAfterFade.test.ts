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
		return { playState: "running", addEventListener: () => undefined, cancel: () => undefined } as unknown as Animation;
	} as HTMLElement["animate"];
});

afterEach(() => {
	vi.restoreAllMocks();
	delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
	document.body.replaceChildren();
});

function draw(rows: KeyedRows, keys: readonly string[], moving = true): Map<string, HTMLElement> {
	const drawing = rows.begin(moving);
	const nodes = new Map(keys.map((key) => [key, drawing.take(key, () => document.createElement("div")).node]));
	drawing.finish();
	return nodes;
}

const growthOf = (node: Element) => played.find((p) => p.node === node && (p.keyframes[0] as Keyframe).height === "0px");

describe("a row coming in while others of its column go", () => {
	it("the No tasks plate waits while a list's last cards fade and grows as they fold: never on top of them (Subprojects off)", () => {
		const rows = new KeyedRows(document.body.appendChild(document.createElement("div")));
		draw(rows, ["a", "b"], false);
		const plate = draw(rows, ["empty"]).get("empty")!;
		const growth = growthOf(plate);
		expect(growth?.options.delay).toBe(150);
		expect(growth?.options.duration).toBe(150);
		expect(growth?.options.fill).toBe("backwards");
	});

	it("grows at once when nothing of its column leaves", () => {
		const rows = new KeyedRows(document.body.appendChild(document.createElement("div")));
		draw(rows, ["a"], false);
		const b = draw(rows, ["a", "b"]).get("b")!;
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
});
