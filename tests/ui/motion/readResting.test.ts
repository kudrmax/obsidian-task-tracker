// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { motionLeft, readResting } from "../../../obsidian/ui/motion/Motion";

/** A fake running move: `end` its computed end time, `at` where it stands; every time it is set is kept. */
function move(end: number, at: number) {
	const set: number[] = [];
	let current: number | null = at;
	const animation = {
		playState: "running",
		effect: { getComputedTiming: () => ({ endTime: end }) },
		get currentTime() {
			return current;
		},
		set currentTime(value: number | null) {
			if (value === null || !Number.isFinite(value)) throw new TypeError("Failed to set the 'currentTime' property on 'Animation': The provided double value is non-finite.");
			set.push(value);
			current = value;
		},
	};
	return { animation: animation as unknown as Animation, set };
}

function host(moves: readonly Animation[]): HTMLElement {
	const el = document.createElement("div");
	el.getAnimations = () => [...moves];
	return el;
}

describe("reading a column where its moves end", () => {
	it("reads where a card's fold ends and puts it back, leaving a caret's endless blink alone (Rows: a field open while the window resizes)", () => {
		const fold = move(300, 120);
		const caret = move(Infinity, 500);
		const el = host([fold.animation, caret.animation]);
		const read = readResting(el, () => fold.animation.currentTime);
		expect(read).toBe(300);
		expect(fold.set).toEqual([300, 120]);
		expect(caret.set).toEqual([]);
	});

	it("counts how long the ending moves still run, and not an endless one", () => {
		expect(motionLeft(host([move(300, 120).animation, move(Infinity, 500).animation]))).toBe(180);
		expect(motionLeft(host([move(Infinity, 500).animation]))).toBe(0);
	});
});

describe("a move made in this frame", () => {
	it("is read where it ends too, though it has not started: a row's height counts its cards gone and its plate come", () => {
		const fold = move(300, 0);
		Object.defineProperty(fold.animation, "currentTime", { configurable: true, get: () => null, set: (value: number) => fold.set.push(value) });
		readResting(host([fold.animation]), () => undefined);
		expect(fold.set).toEqual([300, 0]);
	});
});
