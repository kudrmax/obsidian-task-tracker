import { describe, expect, it } from "vitest";
import { snapMinute, snapStep } from "../../src/application/snapGrid";

describe("snapStep", () => {
	it("takes the finest of 5, 15, 30 and 60 minutes that a finger still moves a step at", () => {
		expect(snapStep(28)).toBe(30);
		expect(snapStep(56)).toBe(15);
		expect(snapStep(112)).toBe(5);
		expect(snapStep(224)).toBe(5);
	});

	it("follows the height between the levels too, as a pinch passes them", () => {
		expect(snapStep(36)).toBe(15);
		expect(snapStep(35)).toBe(30);
		expect(snapStep(100)).toBe(15);
		expect(snapStep(108)).toBe(5);
	});

	it("falls back to an hour when the day is squeezed tighter still", () => {
		expect(snapStep(10)).toBe(60);
		expect(snapStep(4)).toBe(60);
	});
});

describe("snapMinute", () => {
	it("goes to the nearest step of the zoom", () => {
		expect(snapMinute(37, 28)).toBe(30);
		expect(snapMinute(46, 28)).toBe(60);
		expect(snapMinute(52, 56)).toBe(45);
		expect(snapMinute(53, 56)).toBe(60);
		expect(snapMinute(52, 112)).toBe(50);
	});

	it("stays within the day", () => {
		expect(snapMinute(-5, 56)).toBe(0);
		expect(snapMinute(1437, 28)).toBe(1440);
		expect(snapMinute(1500, 28)).toBe(1440);
	});
});
