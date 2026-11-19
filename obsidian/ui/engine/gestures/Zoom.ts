import { useGesture } from "@use-gesture/react";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import { DESIGN } from "../../design";
import { TimeScale } from "../layout/timeScale";
import { useScreenApi, type Zoom } from "../store";

/**
 * The calendar's zoom (spec, «Gestures that are not drag» and «Time scale»): @use-gesture's pinch, which is two fingers on
 * the phone and Ctrl/Cmd + wheel or the trackpad's pinch on the Mac. It stops where it is let go, from the whole day on
 * screen to the largest hour. The minute held still is the one in the middle of the calendar as the pinch begins (the
 * engine reads nowhere where the calendar stands on the page, so it does not know the fingers' height in it): the
 * calendar reveals it at the same height after every step (`ZoomAnchor`). Let go at or under the whole day, the zoom is the
 * whole day, which keeps fitting the calendar's height.
 */

/** Where the pinch holds the day: the minute and how far under the room's top it stays. */
export interface ZoomAnchor {
	readonly minute: number;
	readonly offset: number;
}

/** What the calendar measures of its room: the height a person sees of it (above the screen's foot), and the hour's height at which the whole day fits there. */
export interface RoomMeasure {
	readonly visible: number;
	readonly fit: number;
}

/**
 * The room's measure: its height less its foot (the room under the day kept for the screen's foot, as tall as the foot's
 * probe drawn at that height), and the whole day's hour in what is left under the label's room over the first hour and
 * under the last.
 */
export function roomMeasure(roomHeight: number, footHeight: number): RoomMeasure {
	const visible = Math.max(0, roomHeight - footHeight);
	return { visible, fit: Math.max(1, (visible - 2 * DESIGN.labelLift) / DESIGN.dayHours) };
}

/**
 * The pinch on the calendar's room. `room` is the room, `foot` its probe of the foot's height, `dayTop` how far under its
 * content's top the day starts; `scale` the scale drawn now; `most` the largest hour; `setMeasure` takes the room's measure, taken as it mounts and as a pinch begins (the
 * engine has no observer of a size, so a room whose height changes keeps its measure until then). An interrupted pinch
 * (the calendar unmounted mid-pinch) gives the pointer back and drops its anchor.
 */
export function useCalendarZoom(room: RefObject<HTMLElement | null>, foot: RefObject<HTMLElement | null>, scale: TimeScale, most: number, setMeasure: (measure: RoomMeasure) => void, setAnchor: (anchor: ZoomAnchor | null) => void, dayTop: RefObject<number>): (element: HTMLElement | null) => void {
	const api = useScreenApi();
	const fit = useRef<number | null>(null);
	const drawn = useRef(scale);
	drawn.current = scale;

	/** Stable, so the room's ref is set once, not again on every pinch step. */
	const measure = useCallback(
		(element: HTMLElement | null) => {
			if (!element) return;
			const next = roomMeasure(element.clientHeight, foot.current?.clientHeight ?? 0);
			fit.current = next.fit;
			setMeasure(next);
		},
		[foot, setMeasure],
	);

	useEffect(
		() => () => {
			if (api.getState().gesture === "zoom") api.getState().release("zoom");
			setAnchor(null);
		},
		[api, setAnchor],
	);

	useGesture(
		{
			onPinchStart: ({ cancel }) => {
				const element = room.current;
				if (!element || !api.getState().claim("zoom")) return cancel();
				measure(element);
				const offset = element.clientHeight / 2;
				setAnchor({ offset, minute: drawn.current.minute(element.scrollTop + offset - (dayTop.current ?? DESIGN.labelLift)) });
			},
			onPinch: ({ offset: [hourPx] }) => {
				if (api.getState().gesture === "zoom") api.getState().setZoom(hourPx);
			},
			onPinchEnd: ({ offset: [hourPx] }) => {
				setAnchor(null);
				if (api.getState().gesture !== "zoom") return;
				api.getState().setZoom(zoomAfterPinch(hourPx, fit.current ?? 0));
				api.getState().release("zoom");
			},
		},
		{
			target: room,
			eventOptions: { passive: false },
			pinch: {
				from: () => [drawn.current.hourPx, 0],
				scaleBounds: () => ({ min: fit.current ?? drawn.current.hourPx, max: most }),
				rubberband: false,
				pointer: { touch: true },
				/** Ctrl + wheel or the trackpad's pinch; Cmd + wheel on the Mac too (F97). */
				modifierKey: ["ctrlKey", "metaKey"],
			},
		},
	);
	return measure;
}

/** The zoom a pinch let go at `hourPx` settles on: the whole day at or under its height, else the height itself. */
export function zoomAfterPinch(hourPx: number, wholeDay: number): Zoom {
	return hourPx <= wholeDay + 0.5 ? "wholeDay" : hourPx;
}

/** The hour's height a zoom draws at, held between the whole day and the largest hour. */
export function hourOf(zoom: Zoom, fit: number | null, most: number): number {
	const whole = fit ?? DESIGN.hourPx / 2;
	return TimeScale.within(zoom === "wholeDay" ? whole : zoom, whole, most).hourPx;
}
