import { describe, expect, it } from "vitest";
import { cubicBezier, easingOf } from "../../obsidian/ui/easing";

describe("easing", () => {
	it("starts at 0, ends at 1 and never runs back", () => {
		const ease = cubicBezier(0.12, 0, 0.44, 0.99);
		const steps = Array.from({ length: 21 }, (_, i) => ease(i / 20));
		expect(steps[0]).toBe(0);
		expect(steps[20]).toBe(1);
		for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
	});

	it("follows the curve the stylesheet names: a straight one is the time itself", () => {
		const straight = easingOf("cubic-bezier(0.25, 0.25, 0.75, 0.75)");
		for (const t of [0.1, 0.5, 0.9]) expect(straight(t)).toBeCloseTo(t, 4);
		expect(easingOf(" cubic-bezier(0.12, 0, 0.44, 0.99)")(0.5)).toBeGreaterThan(0.5);
	});

	it("runs evenly for an easing it does not read", () => {
		expect(easingOf("ease-in-out")(0.3)).toBe(0.3);
	});
});
