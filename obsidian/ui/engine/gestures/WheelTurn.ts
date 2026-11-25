import { useDrag } from "@use-gesture/react";
import { useEffect, useRef } from "react";
import { LONG_PRESS_MS } from "../drag/sensors";
import { useScreenApi } from "../store";

/** Slower than this (px/ms, the divider's magnet's) for longer than `CAREFUL_MS`, the wheel turns freely to the gesture's end (the design's «Колёсико»). */
export const CAREFUL_SPEED = 0.08;
export const CAREFUL_MS = 100;

/**
 * How a finger turns the wheel (the design's «Колёсико»; the old plugin's `CarefulPace`): a quick swipe reaches no
 * further than the next stop, wherever the finger goes; once it has gone slowly for a moment it turns freely over the
 * whole wheel to the gesture's end, from where the quick part had it. Pure: fed the finger's `x` and its event's time.
 */
export class WheelTurn {
	private careful = false;
	private slowSince: number | null = null;
	private lastX: number;
	private lastT: number;
	private base: number;
	private fromX: number;
	private at: number;

	constructor(
		/** The stop the wheel stood on when pressed. */
		private readonly start: number,
		/** The last stop: the wheel's stops are 0 to it. */
		private readonly last: number,
		/** An icon's width, px: a finger travelling it turns the wheel one stop. */
		private readonly step: number,
		x: number,
		t: number,
	) {
		this.lastX = x;
		this.lastT = t;
		this.base = start;
		this.fromX = x;
		this.at = start;
	}

	/** Where the wheel stands with the finger at `x` at time `t`: a finger moving left brings the places on the right into the window. */
	move(x: number, t: number): number {
		const speed = t > this.lastT ? Math.abs(x - this.lastX) / (t - this.lastT) : Infinity;
		if (!this.careful) {
			this.slowSince = speed < CAREFUL_SPEED ? (this.slowSince ?? this.lastT) : null;
			if (this.slowSince !== null && t - this.slowSince >= CAREFUL_MS) {
				this.careful = true;
				this.base = this.at;
				this.fromX = x;
			}
		}
		this.lastX = x;
		this.lastT = t;
		const reach = this.careful ? this.last : 1;
		const least = Math.max(0, this.start - reach);
		const most = Math.min(this.last, this.start + reach);
		this.at = Math.min(most, Math.max(least, this.base - (x - this.fromX) / this.step));
		return this.at;
	}

	/** The stop it settles on, let go: the nearest after a careful turn; after a quick swipe the next one its way, or its own. */
	land(): number {
		if (this.careful) return Math.round(this.at);
		const way = Math.sign(this.at - this.start);
		return Math.min(this.last, Math.max(0, this.start + way));
	}
}

/**
 * The wheel turned by a finger or the mouse (@use-gesture's drag, its taps left to the icons' clicks): `turned` while it
 * is held, the stop it is let go on `landed`; the columns stand still meanwhile and slide only once it lands. It holds
 * the gesture slot while it turns. Held still for the long press (the drag's own `delay`: a press that moves first turns
 * at once), it is `held` instead and turns no more until let go (F32).
 */
export function useWheelTurn({ standing, last, step, turned, landed, held }: { readonly standing: () => number; readonly last: number; readonly step: () => number; readonly turned: (at: number) => void; readonly landed: (standing: number | null) => void; readonly held: () => void }) {
	const api = useScreenApi();
	const turn = useRef<WheelTurn | null>(null);
	const pressedLong = useRef(false);
	useEffect(
		() => () => {
			if (turn.current) api.getState().release("wheel");
		},
		[api],
	);
	return useDrag(
		({ first, last: ended, active, intentional, canceled, xy: [x], timeStamp, cancel, tap }) => {
			if (first) pressedLong.current = false;
			if (tap || pressedLong.current) return;
			/** Still under the drag's threshold yet active: its delay ran out, the press held still all along. */
			if (!intentional) {
				if (active && !turn.current) {
					pressedLong.current = true;
					held();
				}
				return;
			}
			if (!turn.current) {
				if (!api.getState().claim("wheel")) return cancel();
				turn.current = new WheelTurn(standing(), last, step(), x, timeStamp);
			}
			const wheel = turn.current;
			if (!ended) return turned(wheel.move(x, timeStamp));
			wheel.move(x, timeStamp);
			turn.current = null;
			api.getState().release("wheel");
			landed(canceled ? null : wheel.land());
		},
		{ filterTaps: true, axis: "x", pointer: { capture: true }, delay: LONG_PRESS_MS, triggerAllEvents: true },
	);
}
