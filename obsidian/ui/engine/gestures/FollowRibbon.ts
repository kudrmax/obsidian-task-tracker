import { useGesture, useWheel } from "@use-gesture/react";
import { animate, type AnimationPlaybackControls, type MotionValue, useMotionValue, useTransform } from "motion/react";
import { createContext, type RefObject, useEffect, useRef, useState } from "react";
import { CALENDAR, drawnWidths, firstPlace, landingWidth, type PlaceWidths, placeOf, placesAfter, standAt } from "../layout/columns";
import { useScreen, useScreenApi } from "../store";
import { type ChangeTiming, changeLook, changeTiming, type DayChange } from "./dayChange";
import { FollowPager, LANDING, landingAt, landingVelocity } from "./followPager";
import { type FingerSignal, TrackpadFollow, type TrackpadFingers } from "./trackpadFollow";
import { type WheelCue, WheelFollow, type WheelSample } from "./wheelFollow";

/** Where the landing counts as done, in places: under a pixel at any width the ribbon has. */
const REST = 0.001;

/**
 * The days a turn draws past the calendar (Max, 2026-11-21; Decision 127): the strip stands; the day's list turns as a
 * page, each day's list with its header, following the fingers; the calendar keeps the shown day while they hold it, at
 * full strength, and switches to the new day quickly as the list lands (`dayChange.ts`), at rest on the same frame.
 */
export interface DayTurn {
	/** Where the days' lists stand, in days from today: 1.3 is a third of the way from tomorrow's to the next day's. */
	readonly at: MotionValue<number>;
	/** The days whose lists are drawn, in days from today: the shown one, and while a finger may draw them in, its neighbours. */
	readonly days: readonly number[];
	/** The day the calendar stands on while no change is under way. */
	readonly shown: number;
	/** The calendar's day changing as the list lands, or null while it stands on its day. */
	readonly change: DayChange | null;
	/** The day going out and the day coming in: their nudge, in widths of the calendar's room, and their strength, read off the list's own landing in the same frame. */
	readonly out: DayLookValues;
	readonly in: DayLookValues;
}

interface DayLookValues {
	readonly x: MotionValue<number>;
	readonly opacity: MotionValue<number>;
}

/** The handlers @use-gesture gives the ribbon's element. */
type GestureHandlers = ReturnType<ReturnType<typeof useGesture>>;

/**
 * Where the ribbon's drag begins, px: @use-gesture's tap threshold, as `filterTaps` set it. The taps themselves are not
 * filtered (`filterTaps` off, its documented default): its click filter outlived a drag cancelled because another gesture
 * held the pointer (a block's dot pulled, F103) or a mouse's pull it never followed, and ate the next tap on a task. A
 * swipe gives no click to filter: a finger that moved past the browser's slop makes none, and a mouse or the trackpad
 * never moves the ribbon by a drag.
 */
const DRAG_THRESHOLD_PX = 3;

export const DayTurnContext = createContext<DayTurn | null>(null);

export interface FollowGestures {
	/** Where the strip stands, in columns from Inbox: 0 Inbox–Soon, 1 Soon–day, 2 the day–its calendar. */
	readonly at: MotionValue<number>;
	readonly turn: DayTurn;
	readonly bind: () => GestureHandlers;
}

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
export function useFollowRibbon(ribbon: RefObject<HTMLElement | null>, calendar: RefObject<HTMLElement | null>, win: Window, fingers: TrackpadFingers | null): FollowGestures {
	const api = useScreenApi();
	const stop = useScreen((s) => s.stop);
	const dayOffset = useScreen((s) => s.dayOffset);
	const dragging = useScreen((s) => s.gesture === "drag");
	/** Where the ribbon stands, in places: the strip's stops, then the days past the calendar. */
	const along = useMotionValue(placeOf(stop, dayOffset));
	const at = useTransform(along, (p) => Math.min(p, CALENDAR));
	const dayAt = useTransform(along, (p) => Math.max(0, p - CALENDAR));
	const [days, setDays] = useState<readonly number[]>(() => [Math.max(0, dayOffset)]);
	const [change, setChange] = useState<DayChange | null>(null);
	const changing = useRef<DayChange | null>(null);
	/** The landing the calendar's change rides: where the list began it and lands, and the switch's times for it. */
	const ride = useRef<{ readonly from: number; readonly to: number; readonly velocity: number; readonly spring: AnimationPlaybackControls; timing: ChangeTiming | null; landedAtOut: number } | null>(null);
	/** The switch at the list's position `v`, the landing's own time read with it: so both stand still on the same frame. */
	const lookAt = (v: number) => {
		const change = changing.current;
		const r = ride.current;
		if (!change || !r) return null;
		const spring = r.spring;
		if (!r.timing) {
			const timing = changeTiming(spring.duration);
			r.timing = timing;
			r.landedAtOut = r.from === r.to ? 1 : (landingAt(r.from, r.to, r.velocity, timing.outS * 1000) - r.from) / (r.to - r.from);
		}
		const landed = r.from === r.to ? 1 : Math.min(1, Math.max(0, (v - r.from) / (r.to - r.from)));
		return changeLook(change, r.timing ?? changeTiming(0), spring.time, landed, r.landedAtOut);
	};
	/** The two days' nudge and strength, each straight off the list's position: as few steps from it as the list's own pages, so neither lags a frame. */
	const outX = useTransform(() => lookAt(along.get())?.out.x ?? 0);
	const outOpacity = useTransform(() => lookAt(along.get())?.out.opacity ?? 1);
	const inX = useTransform(() => lookAt(along.get())?.in.x ?? 0);
	const inOpacity = useTransform(() => lookAt(along.get())?.in.opacity ?? 1);
	/** The day the calendar stands on when no change is under way. */
	const shown = useRef(Math.max(0, dayOffset));
	const [shownDay, setShownDay] = useState(shown.current);
	const drawnDays = useRef(days);
	const glide = useRef<AnimationPlaybackControls | null>(null);
	const pager = useRef(new FollowPager(placeOf(stop, dayOffset), Infinity));
	/** Done is reached only while the screen stands at it (F257): a stroke from there may land on it, any other never. */
	useEffect(() => {
		pager.current.first = firstPlace(stop);
	}, [stop]);
	const wheelFingers = useRef(new WheelFollow());
	/** Without macOS's signals: the wheel gesture has begun a stroke of the ribbon, so it scrolls nothing else until it ends. */
	const wheelLocked = useRef(false);
	const trackpad = useRef(new TrackpadFollow());
	/** The strip is landing: fingers that touch now stop it. */
	const landing = useRef(false);
	/** The pointer is over the ribbon: the fingers on the trackpad are its. */
	const over = useRef(false);
	/** The finger's movement so far in this drag, px on: the pager takes it piece by piece. */
	const drawn = useRef(0);

	/**
	 * A place's width as the browser draws it (the ribbon's width read as a stroke moves, as @use-gesture's pager example reads the window's): a stop's step, half the ribbon; past the calendar a day, the day list's
	 * column, all the ribbon but the calendar, which keeps its width at the calendar all the way (Decision 131).
	 */
	const widths = (): PlaceWidths => {
		const drawn = drawnWidths(ribbon.current, calendar.current);
		return { stop: drawn.view / 2, day: drawn.view - drawn.calendar };
	};
	/** The fingers' pixels as places, each place as wide as it is drawn. */
	const scale = () => {
		const w = widths();
		return { after: (base: number, px: number) => placesAfter(base, px, w) };
	};

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
		settle();
		const from = along.get();
		const day = Math.max(0, to - CALENDAR);
		const velocity = landingVelocity(from, to, speed, landingWidth(from, to, widths()));
		const turn = day === shown.current ? null : { from: shown.current, to: day, way: Math.sign(day - shown.current) };
		const spring = animate(along, to, { type: "spring", ...LANDING, velocity, restDelta: REST, restSpeed: REST });
		glide.current = spring;
		changing.current = turn;
		ride.current = turn ? { from, to, velocity, spring, timing: null, landedAtOut: 1 } : null;
		setChange(turn);
		landing.current = true;
		void spring.then(() => {
			if (glide.current !== spring) return;
			landing.current = false;
			settle();
			if (!pager.current.following) draw(false);
		});
	};

	/** The calendar's change done at once: it stands on the day it was changing to (its landing over, or caught by fingers). */
	const settle = () => {
		const turn = changing.current;
		if (!turn) return;
		ride.current = null;
		changing.current = null;
		shown.current = turn.to;
		setShownDay(turn.to);
		setChange(null);
	};

	/** A stop or day set from outside (a key, a place picked for a new task, a scenario's setup): the ribbon goes there by the same landing. Read as the store stands once the render is in: a finger's lift sets the stop and the day one after the other. */
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
		settle();
		pager.current.begin(along.get(), fresh);
		standAt(screen, pager.current.stop);
		draw(true);
		return true;
	};

	const move = (px: number) => {
		if (!pager.current.following) return;
		along.set(pager.current.move(px, scale()));
	};

	const release = (speed: number) => {
		if (!pager.current.following) return;
		const to = pager.current.release(along.get(), speed, scale());
		const screen = api.getState();
		standAt(screen, to);
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

	const fed = (sample: WheelSample) => {
		const cues = trackpad.current.feed(sample);
		return { cues, claimed: trackpad.current.claimed };
	};

	/** Without macOS's signals the strokes are `WheelFollow`'s, as before; once one began, the wheel gesture is the ribbon's to its end (@use-gesture's wheel end), its momentum too. */
	const fedByStroke = (sample: WheelSample, first: boolean) => {
		if (first) wheelLocked.current = false;
		const cues = wheelFingers.current.feed(sample);
		if (cues.some((c) => c.kind === "begin")) wheelLocked.current = true;
		return { cues, claimed: wheelLocked.current && !sample.ctrl };
	};

	const gestures = useGesture(
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
		},
		{
			window: win,
			enabled: !dragging,
			drag: {
				/** The pointer is followed on the view's window, not captured by the card under the finger: a long press there can hand it to the drag mid-swipe, and the ribbon's gesture still ends. */
				pointer: { capture: false },
				axis: "x",
				threshold: DRAG_THRESHOLD_PX,
			},
		},
	);
	useWheel(
		({ event, first, last }) => {
			if (!last) over.current = true;
			const sample = { dx: event.deltaX, dy: event.deltaY, t: event.timeStamp, ctrl: event.ctrlKey };
			/** @use-gesture's wheel ends after its own quiet (140 ms): without macOS's signals fingers still down then let go (more than `quietMs`); with them only a lift still waiting for its last deltas, or a cut no touch followed. */
			const { cues, claimed } = last ? { cues: fingers ? trackpad.current.tick() : wheelFingers.current.tick(Infinity), claimed: false } : fingers ? fed(sample) : fedByStroke(sample, first);
			if (api.getState().gesture === "drag") return;
			/** One stroke, one axis: the ribbon's stroke and its momentum scroll no list or calendar up or down. */
			if (claimed && event.cancelable) event.preventDefault();
			cues.forEach(cue);
		},
		/** On the ribbon itself and not passive (React's own wheel listener is): the ribbon's stroke keeps its wheel events from scrolling the lists. */
		{ target: ribbon, enabled: !dragging, eventOptions: { passive: false } },
	);
	/** A card carried: only the shown day is drawn, so a day out of sight never lies under it as a place to drop on. */
	const drawnNow = dragging ? [Math.max(0, dayOffset)] : days;
	const bind = () => gestures();
	return { at, turn: { at: dayAt, days: drawnNow, shown: shownDay, change, out: { x: outX, opacity: outOpacity }, in: { x: inX, opacity: inOpacity } }, bind };
}
