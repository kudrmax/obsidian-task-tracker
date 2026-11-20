import { useGesture } from "@use-gesture/react";
import { animate, type AnimationPlaybackControls, type MotionValue, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";
import { createContext, type RefObject, useEffect, useRef, useState } from "react";
import { STOPS, type Stop, useScreen, useScreenApi } from "../store";
import { FollowPager, LANDING, landingVelocity } from "./followPager";
import { type FingerSignal, TrackpadFollow, type TrackpadFingers } from "./trackpadFollow";
import { type WheelCue, WheelFollow } from "./wheelFollow";

/** Where the landing counts as done, in places: under a pixel at any width the ribbon has. */
const REST = 0.001;

/** The ribbon's last stop, the day and its calendar: past it the places are the days, one a day. */
const CALENDAR = STOPS.length - 1;

/**
 * The days a turn draws (docs/plugin/screen.md, «Свайп по экрану и дни»): past the calendar the strip stands and in each
 * of the day's columns the day slides out as the next comes in, the header and the hours standing still.
 */
export interface DayTurn {
	/** Where the days stand, in days from today: 1.3 is a third of the way from tomorrow to the day after. */
	readonly at: MotionValue<number>;
	/** The days drawn, in days from today: the shown one, and while a finger may draw them in, its neighbours. */
	readonly days: readonly number[];
}

export const DayTurnContext = createContext<DayTurn | null>(null);

/** The day that stands nearer in sight as the days turn, as the plugin's header names it while a finger draws the next day in. */
export function useNearerDay(turn: DayTurn): number {
	const [nearer, setNearer] = useState(() => Math.round(turn.at.get()));
	useMotionValueEvent(turn.at, "change", (p) => setNearer(Math.round(p)));
	return nearer;
}

export interface FollowGestures {
	/** Where the strip stands, in columns from Inbox: 0 Inbox–Soon, 1 Soon–day, 2 the day–its calendar. */
	readonly at: MotionValue<number>;
	readonly turn: DayTurn;
	readonly bind: ReturnType<typeof useGesture>;
}

/** Where the ribbon stands at a stop and day, in places: the stops 0–2, past the calendar one place a day. */
const placeOf = (stop: Stop, dayOffset: number) => STOPS.indexOf(stop) + (stop === "calendar" ? Math.max(0, dayOffset) : 0);

const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((day, i) => day === b[i]);

/**
 * The ribbon as a gallery (Max, 2026-11-19; stage0.md, «Round seven»): one finger on glass and two on the trackpad are
 * one action. The strip follows them (`FollowPager`, one place either way of where the stroke began); let go, one spring
 * lands it on the place the rule gives; a stroke during the landing takes the strip from where it stands. The trackpad's
 * wheel deltas become a finger's cues in `TrackpadFollow` by macOS's own touch and lift when the host hears them
 * (`fingers`, Decision 126), else in `WheelFollow` (the lift read from macOS's momentum, which then moves nothing;
 * @use-gesture's wheel end, its 140 ms of quiet, lets go fingers that stopped without momentum). Both read the one gesture
 * slot; the stop the store keeps is where the strip lands.
 */
export function useFollowRibbon(ribbon: RefObject<HTMLElement | null>, win: Window, fingers: TrackpadFingers | null): FollowGestures {
	const api = useScreenApi();
	const stop = useScreen((s) => s.stop);
	const dayOffset = useScreen((s) => s.dayOffset);
	const dragging = useScreen((s) => s.gesture === "drag");
	/** Where the ribbon stands, in places: the strip's stops, then the days past the calendar. */
	const along = useMotionValue(placeOf(stop, dayOffset));
	const at = useTransform(along, (p) => Math.min(p, CALENDAR));
	const dayAt = useTransform(along, (p) => Math.max(0, p - CALENDAR));
	const [days, setDays] = useState<readonly number[]>(() => [Math.max(0, dayOffset)]);
	const drawnDays = useRef(days);
	const glide = useRef<AnimationPlaybackControls | null>(null);
	const pager = useRef(new FollowPager(placeOf(stop, dayOffset), Infinity));
	const wheelFingers = useRef(new WheelFollow());
	const trackpad = useRef(new TrackpadFollow());
	/** The strip is landing: fingers that touch now stop it. */
	const landing = useRef(false);
	/** The pointer is over the ribbon: the fingers on the trackpad are its. */
	const over = useRef(false);
	/** The finger's movement so far in this drag, px on: the pager takes it piece by piece. */
	const drawn = useRef(0);

	/** Half the ribbon: one column, the way a step goes (the browser's width of the ribbon, read as a stroke moves, as @use-gesture's pager example reads the window's). */
	const column = () => (ribbon.current?.clientWidth ?? 0) / 2;

	/**
	 * The days to draw: those in sight now and those a finger can bring into sight from the place the ribbon stands at or
	 * lands on, mounted ahead (`ahead`), so a stroke never waits for a day to be drawn; while it moves, the days it drew in
	 * stay until it stands.
	 */
	const draw = (moving: boolean) => {
		const p = along.get() - CALENDAR;
		const stop = pager.current.stop - CALENDAR;
		const near = stop < 0 ? [] : [stop - 1, stop, stop + 1];
		const next = [...new Set([...near, Math.floor(p), Math.ceil(p), ...(moving ? drawnDays.current : [])])].filter((day) => day >= 0).sort((a, b) => a - b);
		const shown = next.length > 0 ? next : [0];
		api.getState().peekDays(shown);
		if (sameDays(drawnDays.current, shown)) return;
		drawnDays.current = shown;
		setDays(shown);
	};

	/** One landing, the same after a finger, two fingers or a place set from outside; it starts at the fingers' speed (`landingVelocity`), never at the speed Motion read off the strip's last sets. */
	const land = (to: number, speed = 0) => {
		glide.current?.stop();
		const velocity = landingVelocity(along.get(), to, speed, column());
		const spring = animate(along, to, { type: "spring", ...LANDING, velocity, restDelta: REST, restSpeed: REST });
		glide.current = spring;
		landing.current = true;
		void spring.then(() => {
			if (glide.current !== spring) return;
			landing.current = false;
			if (!pager.current.following) draw(false);
		});
	};

	/** A stop or day set from outside (a scenario's setup): the ribbon goes there by the same landing. Read as the store stands once the render is in: a finger's lift sets the stop and the day one after the other. */
	useEffect(() => {
		const now = api.getState();
		const to = placeOf(now.stop, now.dayOffset);
		if (pager.current.following || pager.current.stop === to) return;
		pager.current.stop = to;
		draw(true);
		land(to);
	}, [stop, dayOffset]);
	useEffect(() => {
		draw(false);
		return () => glide.current?.stop();
	}, []);

	const begin = (fresh: boolean): boolean => {
		const screen = api.getState();
		if (!pager.current.following && !screen.claim("ribbon")) return false;
		glide.current?.stop();
		landing.current = false;
		pager.current.begin(along.get(), fresh);
		screen.setStop(STOPS[Math.min(pager.current.stop, CALENDAR)]);
		screen.showDay(Math.max(0, pager.current.stop - CALENDAR));
		draw(true);
		return true;
	};

	const move = (px: number) => {
		if (pager.current.following) along.set(pager.current.move(px, column()));
	};

	const release = (speed: number) => {
		if (!pager.current.following) return;
		const to = pager.current.release(along.get(), speed, column());
		const screen = api.getState();
		screen.setStop(STOPS[Math.min(to, CALENDAR)]);
		screen.showDay(Math.max(0, to - CALENDAR));
		screen.release("ribbon");
		draw(true);
		land(to, speed);
	};

	const cue = (c: WheelCue) => {
		if (c.kind === "begin") begin(c.fresh);
		else if (c.kind === "move") move(c.dx);
		else release(c.speed);
	};

	/** macOS's touch and lift, in this window's time: the ribbon's when the pointer is over it. */
	useEffect(() => {
		if (!fingers) return;
		return fingers.listen(win, (signal: FingerSignal) => {
			const cues = trackpad.current.signal(signal, landing.current && over.current);
			if (api.getState().gesture === "drag") return;
			cues.forEach(cue);
		});
	}, [fingers, win]);

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
			onHover: ({ hovering }) => {
				over.current = !!hovering;
			},
			onWheel: ({ event, last }) => {
				if (!last) over.current = true;
				const sample = { dx: event.deltaX, dy: event.deltaY, t: event.timeStamp, ctrl: event.ctrlKey };
				/** @use-gesture's wheel ends after its own quiet (140 ms): without macOS's signals fingers still down then let go (more than `quietMs`); with them only a lift still waiting for its last deltas, or a cut no touch followed. */
				const cues = fingers ? (last ? trackpad.current.tick() : trackpad.current.feed(sample)) : last ? wheelFingers.current.tick(Infinity) : wheelFingers.current.feed(sample);
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
	/** A card carried: only the shown day is drawn, so a day out of sight never lies under it as a place to drop on. */
	const drawnNow = dragging ? [Math.max(0, dayOffset)] : days;
	return { at, turn: { at: dayAt, days: drawnNow }, bind };
}
