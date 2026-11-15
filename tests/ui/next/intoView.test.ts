// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { easingOf, Scroll } from "../../../obsidian/ui/next/drivers/scroll";
import { cardRows } from "../../../obsidian/ui/next/model/menuNeeds";
import { updateBlock } from "../../../obsidian/ui/next/update/block";
import { BlockLoop } from "./blockLoop";

describe("a card comes into view before its menu opens (the old menu's scrollIntoColumn)", () => {
	it("a tap asks for the card in view first, and the menu opens only on its answer", async () => {
		const loop = await BlockLoop.open();
		const key = [...cardRows(loop.model).values()][0].key;
		const [model, commands] = updateBlock(loop.model, { kind: "carry", msg: { kind: "tap", key, act: "card", mod: false, shift: false } });
		expect(model.layers).toEqual([]);
		expect(commands).toContainEqual({ kind: "intoView", key, then: { kind: "menu", msg: { kind: "opened", id: key } } });
	});

	it("a right click and a card's own act ask the same", async () => {
		const loop = await BlockLoop.open();
		const key = [...cardRows(loop.model).values()][0].key;
		for (const msg of [{ kind: "carry", msg: { kind: "context", key } }, { kind: "cardTapped", key, part: "card" }] as const) {
			const [model, commands] = updateBlock(loop.model, msg);
			expect(model.layers).toEqual([]);
			expect(commands.map((c) => c.kind)).toEqual(["intoView"]);
		}
	});
});

describe("the glide into view", () => {
	it("eases along the token's curve, from none of the way to all of it", () => {
		const ease = easingOf("cubic-bezier(0.2, 0.8, 0.2, 1)");
		expect(ease(0)).toBe(0);
		expect(ease(1)).toBe(1);
		expect(ease(0.5)).toBeGreaterThan(0.5);
		expect(easingOf("ease")(0.3)).toBeCloseTo(0.3);
	});

	it("gets there frame by frame and says so once", () => {
		vi.useFakeTimers();
		const scroller = document.createElement("div");
		const done = vi.fn();
		Scroll.glideTo(scroller, 0, 120, 150, "cubic-bezier(0.2, 0.8, 0.2, 1)", done);
		vi.advanceTimersByTime(400);
		expect(done.mock.calls).toEqual([["arrived"]]);
		vi.useRealTimers();
	});

	it("yields to a finger at once, and nothing follows", () => {
		vi.useFakeTimers();
		const scroller = document.createElement("div");
		const done = vi.fn();
		Scroll.glideTo(scroller, 0, 120, 150, "linear", done);
		scroller.dispatchEvent(new Event("pointerdown"));
		vi.advanceTimersByTime(400);
		expect(done.mock.calls).toEqual([["finger"]]);
		vi.useRealTimers();
	});

	it("called off, tells nothing", () => {
		vi.useFakeTimers();
		const done = vi.fn();
		Scroll.glideTo(document.createElement("div"), 0, 120, 150, "linear", done)();
		vi.advanceTimersByTime(400);
		expect(done).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});
