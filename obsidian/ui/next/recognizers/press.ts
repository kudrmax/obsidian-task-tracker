/**
 * How a press on a card turns into a gesture (the old screen's `LongPress` and `DragController`, as a pure machine): a
 * finger waits out the long press without wandering and lifts the card; a mouse lifts it by moving past a few pixels
 * (its grab kept); released before anything started it is a tap; a right click opens the menu. A second finger makes
 * the press part of a pinch: it is forgotten. Once lifted, every move carries the card and the release drops it.
 */

/** How far a finger may wander and still press, px; a mouse's press becomes a drag past `DRAG_START`. */
export const PRESS_TOLERANCE = 8;
export const DRAG_START = 4;

/** What a press landed on: the part of the view marked, and the row it is in. */
export interface PressTarget {
	readonly act: string;
	readonly key: string | null;
}

export interface Point {
	readonly x: number;
	readonly y: number;
}

/** The input driver's stream, one event at a time. */
export type PressInput =
	| { readonly kind: "down"; readonly id: number; readonly at: Point; readonly mouse: boolean; readonly primary: boolean; readonly button: number; readonly target: PressTarget; readonly mod: boolean; readonly shift: boolean }
	| { readonly kind: "move"; readonly id: number; readonly at: Point }
	| { readonly kind: "up"; readonly id: number; readonly at: Point }
	| { readonly kind: "cancel"; readonly id: number }
	/** The long press's wait ended (the driver's timer, armed on `down` of a finger). */
	| { readonly kind: "held" }
	/** A right click (the context menu asked for) on a target. */
	| { readonly kind: "context"; readonly target: PressTarget };

/** What the press means, for the model. */
export type Gesture =
	| { readonly kind: "tap"; readonly target: PressTarget; readonly mouse: boolean; readonly mod: boolean; readonly shift: boolean }
	| { readonly kind: "menu"; readonly target: PressTarget }
	/** The card lifts: the finger at `at`, which pressed it at `from` (the grab is the card's box against `from`). */
	| { readonly kind: "lift"; readonly target: PressTarget; readonly from: Point; readonly at: Point; readonly mouse: boolean }
	| { readonly kind: "carry"; readonly at: Point }
	| { readonly kind: "drop"; readonly at: Point }
	/** The carrying pointer was lost (cancelled by the system): the carry goes back. */
	| { readonly kind: "lost" };

export type PressState =
	| { readonly kind: "idle" }
	| { readonly kind: "pressing"; readonly id: number; readonly from: Point; readonly last: Point; readonly mouse: boolean; readonly target: PressTarget; readonly mod: boolean; readonly shift: boolean }
	| { readonly kind: "carrying"; readonly id: number };

export const IDLE: PressState = { kind: "idle" };

/** The parts of a card a press may lift it by (the card itself, its counter, its folder mark), and a section's header. */
const LIFTS = new Set(["card", "counter", "mark", "head"]);

/**
 * The plus (the old screen's `PlusButton`): a tap opens the field; moved past the press tolerance, finger or mouse, it is
 * carried at once, with no long press to wait out.
 */
const PLUS = "plus";

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * One event of the stream: the next state and the gesture it completes, if any. `armTimer` is true when a finger's
 * press just began, so the driver arms the long press's wait; any other outcome drops a wait under way.
 */
export function press(state: PressState, input: PressInput): { readonly state: PressState; readonly gesture: Gesture | null; readonly armTimer: boolean } {
	const none = (next: PressState) => ({ state: next, gesture: null, armTimer: false });
	switch (input.kind) {
		case "down": {
			if (state.kind === "pressing" && input.id !== state.id) return none(IDLE);
			const plus = input.target.act === PLUS;
			if (state.kind !== "idle" || !input.primary || input.button !== 0 || !(plus || LIFTS.has(input.target.act))) return none(state);
			return { state: { kind: "pressing", id: input.id, from: input.at, last: input.at, mouse: input.mouse, target: input.target, mod: input.mod, shift: input.shift }, gesture: null, armTimer: !input.mouse && !plus };
		}
		case "move": {
			if (state.kind === "carrying") return input.id === state.id ? { state, gesture: { kind: "carry", at: input.at }, armTimer: false } : none(state);
			if (state.kind !== "pressing" || input.id !== state.id) return none(state);
			const moved = distance(input.at, state.from);
			if (state.target.act === PLUS) {
				if (moved <= PRESS_TOLERANCE) return { state: { ...state, last: input.at }, gesture: null, armTimer: false };
				return { state: { kind: "carrying", id: state.id }, gesture: { kind: "lift", target: state.target, from: state.from, at: input.at, mouse: state.mouse }, armTimer: false };
			}
			if (state.mouse && moved > DRAG_START) return { state: { kind: "carrying", id: state.id }, gesture: { kind: "lift", target: state.target, from: state.from, at: input.at, mouse: true }, armTimer: false };
			if (!state.mouse && moved > PRESS_TOLERANCE) return none(IDLE);
			return { state: { ...state, last: input.at }, gesture: null, armTimer: false };
		}
		case "up": {
			if (state.kind === "carrying") return input.id === state.id ? { state: IDLE, gesture: { kind: "drop", at: input.at }, armTimer: false } : none(state);
			if (state.kind !== "pressing" || input.id !== state.id) return none(state);
			if (distance(input.at, state.from) > PRESS_TOLERANCE) return none(IDLE);
			return { state: IDLE, gesture: { kind: "tap", target: state.target, mouse: state.mouse, mod: state.mod, shift: state.shift }, armTimer: false };
		}
		case "cancel":
			if (state.kind === "carrying" && input.id === state.id) return { state: IDLE, gesture: { kind: "lost" }, armTimer: false };
			return none(state.kind === "pressing" && input.id === state.id ? IDLE : state);
		case "held":
			if (state.kind === "pressing" && state.target.act === PLUS) return none(state);
			if (state.kind !== "pressing" || state.mouse) return none(state.kind === "pressing" ? IDLE : state);
			return { state: { kind: "carrying", id: state.id }, gesture: { kind: "lift", target: state.target, from: state.from, at: state.last, mouse: false }, armTimer: false };
		case "context":
			return state.kind === "carrying" ? none(state) : { state: IDLE, gesture: LIFTS.has(input.target.act) ? { kind: "menu", target: input.target } : null, armTimer: false };
	}
}
