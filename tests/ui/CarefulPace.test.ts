import { describe, expect, it } from "vitest";
import { CarefulPace } from "../../src/ui/CarefulPace";

const walk = (pace: CarefulPace, from: number, px: number, ms: number, steps: number, t0 = 0) => {
	for (let i = 1; i <= steps; i++) pace.update(from + i * px, t0 + i * ms);
};

describe("CarefulPace", () => {
	it("is not careful on a quick swipe", () => {
		const pace = new CarefulPace(0, 0);
		walk(pace, 0, 20, 16, 10);
		expect(pace.careful).toBe(false);
	});

	it("is careful once the finger goes slowly for a while, and stays so when it speeds up", () => {
		const pace = new CarefulPace(0, 0);
		walk(pace, 0, 1, 20, 4);
		expect(pace.careful).toBe(false);
		walk(pace, 4, 1, 20, 4, 80);
		expect(pace.careful).toBe(true);
		walk(pace, 8, 30, 16, 5, 160);
		expect(pace.careful).toBe(true);
	});

	it("is careful when a quick swipe slows down", () => {
		const pace = new CarefulPace(0, 0);
		walk(pace, 0, 20, 16, 5);
		walk(pace, 100, 1, 20, 15, 80);
		expect(pace.careful).toBe(true);
	});

	it("counts a finger standing still before it lets go as slow since it stopped", () => {
		const pace = new CarefulPace(0, 0);
		walk(pace, 0, 20, 16, 5);
		pace.update(100, 300);
		expect(pace.careful).toBe(true);
	});

	it("does not count a rest before the first move", () => {
		const pace = new CarefulPace(0, 0);
		pace.update(10, 200);
		walk(pace, 10, 20, 16, 5, 200);
		expect(pace.careful).toBe(false);
	});
});
