import { describe, expect, it } from "vitest";
import { PointerSpeed } from "../../src/ui/PointerSpeed";

describe("PointerSpeed", () => {
	it("starts still", () => {
		expect(new PointerSpeed(100, 0).value).toBe(0);
	});

	it("settles on a steady pace, either way", () => {
		const speed = new PointerSpeed(100, 0);
		for (let i = 1; i <= 30; i++) speed.update(100 - i * 10, i * 10);
		expect(speed.value).toBeCloseTo(1, 2);
	});

	it("smooths a single jerk", () => {
		const speed = new PointerSpeed(0, 0);
		speed.update(40, 10);
		expect(speed.value).toBeLessThan(4);
		expect(speed.value).toBeGreaterThan(0);
	});

	it("counts the distance of an event at the same instant with the next one", () => {
		const speed = new PointerSpeed(0, 0);
		speed.update(10, 0);
		speed.update(20, 20);
		const steady = new PointerSpeed(0, 0);
		steady.update(20, 20);
		expect(speed.value).toBe(steady.value);
	});

	it("drops to the pace after a pause", () => {
		const speed = new PointerSpeed(0, 0);
		for (let i = 1; i <= 10; i++) speed.update(i * 20, i * 10);
		speed.update(202, 300);
		expect(speed.value).toBeLessThan(0.02);
	});
});
