import { useGesture } from "@use-gesture/react";
import { animate, type AnimationPlaybackControls, type MotionValue, useMotionValue } from "motion/react";
import { type RefObject, useEffect, useRef } from "react";
import { offsetOf } from "../layout/columns";
import { STOPS, useScreen, useScreenApi } from "../store";
import { FollowPager, LANDING, landingVelocity } from "./followPager";
import { type WheelCue, WheelFollow } from "./wheelFollow";

/** Where the landing counts as done, in places: under a pixel at any width the ribbon has. */
const REST = 0.001;

export interface FollowGestures {
	/** Where the strip stands, in columns from Inbox: 0 Inbox–Soon, 1 Soon–day, 2 the day–its calendar. */
	readonly at: MotionValue<number>;
	readonly bind: ReturnType<typeof useGesture>;
}

/**
 * The ribbon as a gallery (Max, 2026-11-19; stage0.md, «Round seven»): one finger on glass and two on the trackpad are
 * one action. The strip follows them (`FollowPager`, one place either way of where the stroke began); let go, one spring
 * lands it on the place the rule gives; a stroke during the landing takes the strip from where it stands. The trackpad's
 * wheel deltas become a finger's cues in `WheelFollow` (the lift read from macOS's momentum, which then moves nothing);
 * @use-gesture's wheel end (its 140 ms of quiet) lets go fingers that stopped without momentum. Both read the one gesture
 * slot; the stop the store keeps is where the strip lands.
 */
export function useFollowRibbon(ribbon: RefObject<HTMLElement | null>, win: Window): FollowGestures {
	const api = useScreenApi();
	const stop = useScreen((s) => s.stop);
	const dragging = useScreen((s) => s.gesture === "drag");
	const at = useMotionValue(offsetOf(stop));
	const glide = useRef<AnimationPlaybackControls | null>(null);
	const pager = useRef(new FollowPager(STOPS.indexOf(stop), STOPS.length - 1));
	const fingers = useRef(new WheelFollow());
	/** The finger's movement so far in this drag, px on: the pager takes it piece by piece. */
	const drawn = useRef(0);

	/** Half the ribbon: one column, the way a step goes (the browser's width of the ribbon, read as a stroke moves, as @use-gesture's pager example reads the window's). */
	const column = () => (ribbon.current?.clientWidth ?? 0) / 2;

	/** One landing, the same after a finger, two fingers or a stop set from outside; it starts at the fingers' speed (`landingVelocity`), never at the speed Motion read off the strip's last sets. */
	const land = (to: number, speed = 0) => {
		glide.current?.stop();
		const target = offsetOf(STOPS[to]);
		const velocity = landingVelocity(at.get(), target, speed, column());
		glide.current = animate(at, target, { type: "spring", ...LANDING, velocity, restDelta: REST, restSpeed: REST });
	};

	/** A stop set from outside (a scenario's setup): the strip goes there by the same landing. */
	useEffect(() => {
		const to = STOPS.indexOf(stop);
		if (pager.current.following || pager.current.stop === to) return;
		pager.current.stop = to;
		land(to);
	}, [stop]);
	useEffect(() => () => glide.current?.stop(), []);

	const begin = (fresh: boolean): boolean => {
		const screen = api.getState();
		if (!pager.current.following && !screen.claim("ribbon")) return false;
		glide.current?.stop();
		pager.current.begin(at.get(), fresh);
		screen.setStop(STOPS[pager.current.stop]);
		return true;
	};

	const move = (px: number) => {
		if (pager.current.following) at.set(pager.current.move(px, column()));
	};

	const release = (speed: number) => {
		if (!pager.current.following) return;
		const to = pager.current.release(at.get(), speed, column());
		const screen = api.getState();
		screen.setStop(STOPS[to]);
		screen.release("ribbon");
		land(to, speed);
	};

	const cue = (c: WheelCue) => {
		if (c.kind === "begin") begin(c.fresh);
		else if (c.kind === "move") move(c.dx);
		else release(c.speed);
	};

	const bind = useGesture(
		{
			onDrag: ({ first, last, xy: [x], initial: [x0], velocity: [vx], direction: [dx], event, cancel }) => {
				if ((event as PointerEvent).pointerType === "mouse") return;
				if (first) {
					drawn.current = 0;
					if (!begin(true)) return cancel();
				}
				if (!pager.current.following || api.getState().gesture !== "ribbon") return cancel();
				/** From where the finger went down, not @use-gesture's `movement`, which starts past its threshold and left the columns that far behind the finger. */
				const on = x0 - x;
				move(on - drawn.current);
				drawn.current = on;
				if (last) release(-vx * dx);
			},
			onWheel: ({ event, last }) => {
				/** @use-gesture's wheel ends after its own quiet (140 ms, more than `quietMs`): fingers still down then let go. */
				const cues = last ? fingers.current.tick(Infinity) : fingers.current.feed({ dx: event.deltaX, dy: event.deltaY, t: event.timeStamp, ctrl: event.ctrlKey });
				if (api.getState().gesture === "drag") return;
				cues.forEach(cue);
			},
		},
		{
			window: win,
			enabled: !dragging,
			drag: {
				/** The pointer is followed on the view's window, not captured by the card under the finger: a long press there can hand it to the drag mid-swipe, and the ribbon's gesture still ends. */
				pointer: { capture: false },
				axis: "x",
				filterTaps: true,
			},
		},
	);
	return { at, bind };
}
