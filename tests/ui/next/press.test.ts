import { describe, expect, it } from "vitest";
import { type Gesture, IDLE, press, type PressInput, type PressState } from "../../../obsidian/ui/next/recognizers/press";

const card = { act: "card", key: "t1" };
const down = (x: number, y: number, mouse: boolean, extra: Partial<Extract<PressInput, { kind: "down" }>> = {}): PressInput => ({ kind: "down", id: 1, at: { x, y }, mouse, primary: true, button: 0, target: card, mod: false, shift: false, ...extra });
const move = (x: number, y: number, id = 1): PressInput => ({ kind: "move", id, at: { x, y } });
const up = (x: number, y: number): PressInput => ({ kind: "up", id: 1, at: { x, y } });

/** A stream run through the recognizer: the gestures it read, whether a wait was armed at each step, the state it ends in. */
function run(inputs: readonly PressInput[], from: PressState = IDLE): { gestures: Gesture[]; armed: boolean[]; state: PressState } {
	let state = from;
	const gestures: Gesture[] = [];
	const armed: boolean[] = [];
	for (const input of inputs) {
		const out = press(state, input);
		state = out.state;
		armed.push(out.armTimer);
		if (out.gesture) gestures.push(out.gesture);
	}
	return { gestures, armed, state };
}

describe("the press recognizer (inventory A4, A16)", () => {
	it("reads a mouse's press and release in place as a tap", () => {
		expect(run([down(10, 10, true), up(11, 10)]).gestures).toEqual([{ kind: "tap", target: card, mouse: true, mod: false, shift: false }]);
	});

	it("lifts a card under the mouse once it moved past the drag's start, its grab kept, and then carries it", () => {
		const { gestures, state } = run([down(10, 10, true), move(12, 11), move(10, 20), move(10, 40), up(10, 40)]);
		expect(gestures.map((g) => g.kind)).toEqual(["lift", "carry", "drop"]);
		expect(gestures[0]).toEqual({ kind: "lift", target: card, from: { x: 10, y: 10 }, at: { x: 10, y: 20 }, mouse: true });
		expect(state).toEqual(IDLE);
	});

	it("arms the long press for a finger only, and lifts the card when it is held still", () => {
		const { gestures, armed } = run([down(10, 10, false), move(13, 12), { kind: "held" }, move(10, 60), up(10, 60)]);
		expect(armed[0]).toBe(true);
		expect(gestures.map((g) => g.kind)).toEqual(["lift", "carry", "drop"]);
		expect(run([down(10, 10, true)]).armed).toEqual([false]);
	});

	it("lets a finger that wanders before the wait scroll: no lift, no tap", () => {
		expect(run([down(10, 10, false), move(10, 30), { kind: "held" }, up(10, 30)]).gestures).toEqual([]);
	});

	it("does nothing with a mouse held still (a long click on a list card opens nothing)", () => {
		expect(run([down(10, 10, true), { kind: "held" }, up(10, 10)]).gestures).toEqual([]);
	});

	it("forgets a press when a second finger comes down (a pinch)", () => {
		expect(run([down(10, 10, false), down(50, 50, false, { id: 2, primary: false }), up(10, 10)]).gestures).toEqual([]);
	});

	it("reads a right click on a card as its menu, and nothing on anything else", () => {
		expect(run([{ kind: "context", target: card }]).gestures).toEqual([{ kind: "menu", target: card }]);
		expect(run([{ kind: "context", target: { act: "plus", key: null } }]).gestures).toEqual([]);
	});

	it("takes a press only on a card's parts, the plus and a header, a primary pointer, the main button", () => {
		expect(run([down(0, 0, true, { target: { act: "add", key: null } }), up(0, 0)]).gestures).toEqual([]);
		expect(run([down(0, 0, true, { button: 2 }), up(0, 0)]).gestures).toEqual([]);
	});

	it("ends a carry whose pointer the system cancelled as lost", () => {
		const lifted = run([down(10, 10, true), move(10, 30)]).state;
		expect(run([{ kind: "cancel", id: 1 }], lifted).gestures).toEqual([{ kind: "lost" }]);
	});

	it("carries the counter's and the folder's presses as the card's, their tap told by its part", () => {
		const counter = { act: "counter", key: "t1" };
		expect(run([down(0, 0, true, { target: counter }), up(0, 0)]).gestures).toEqual([{ kind: "tap", target: counter, mouse: true, mod: false, shift: false }]);
	});

	it("lifts the plus once moved past the press's tolerance, by a finger or a mouse, with no long press (the old PlusButton)", () => {
		const plus = { act: "plus", key: null };
		const finger = run([down(10, 10, false, { target: plus }), move(10, 30), move(10, 60), up(10, 60)]);
		expect(finger.armed[0]).toBe(false);
		expect(finger.gestures.map((g) => g.kind)).toEqual(["lift", "carry", "drop"]);
		expect(run([down(10, 10, true, { target: plus }), move(30, 10), up(30, 10)]).gestures.map((g) => g.kind)).toEqual(["lift", "drop"]);
		expect(run([down(10, 10, false, { target: plus }), { kind: "held" }, up(10, 10)]).gestures).toEqual([{ kind: "tap", target: plus, mouse: false, mod: false, shift: false }]);
	});

	it("lifts a section's header as a card: a finger held, a mouse moved; a tap is its menu", () => {
		const head = { act: "head", key: "head:t14" };
		expect(run([down(10, 10, false, { target: head }), { kind: "held" }, move(10, 60), up(10, 60)]).gestures.map((g) => g.kind)).toEqual(["lift", "carry", "drop"]);
		expect(run([down(10, 10, true, { target: head }), move(10, 30), up(10, 30)]).gestures.map((g) => g.kind)).toEqual(["lift", "drop"]);
		expect(run([down(10, 10, true, { target: head }), up(10, 10)]).gestures).toEqual([{ kind: "tap", target: head, mouse: true, mod: false, shift: false }]);
	});
});
