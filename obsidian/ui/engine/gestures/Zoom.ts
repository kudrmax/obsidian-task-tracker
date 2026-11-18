import { useGesture } from "@use-gesture/react";
import { type RefObject, useCallback, useRef } from "react";
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

/**
 * The hour's height at which the whole day fits the room: its height less the label's room over the first hour and under
 * the last, and the room under the day kept for the screen's foot (the room's own padding, its scroll height less the day).
 */
export function wholeDayHour(room: HTMLElement, hourPx: number, dayEnd: number): number {
	const day = Math.max(DESIGN.dayHours * hourPx, dayEnd);
	const foot = Math.max(0, room.scrollHeight - day - 2 * DESIGN.labelLift);
	return Math.max(1, (room.clientHeight - foot - 2 * DESIGN.labelLift) / DESIGN.dayHours);
}

/**
 * The pinch on the calendar's room. `scale` is the scale drawn now; `most` the largest hour; `setFit` takes the whole day's
 * hour once measured; `dayEnd` the bottom of the lowest card (a stack past midnight lengthens the day).
 */
export function useCalendarZoom(room: RefObject<HTMLElement | null>, scale: TimeScale, most: number, dayEnd: number, setFit: (fit: number) => void, setAnchor: (anchor: ZoomAnchor | null) => void): (element: HTMLElement | null) => void {
	const api = useScreenApi();
	const fit = useRef<number | null>(null);

	const measure = useCallback(
		(element: HTMLElement | null) => {
			if (!element) return;
			fit.current = wholeDayHour(element, scale.hourPx, dayEnd);
			setFit(fit.current);
		},
		[scale.hourPx, dayEnd, setFit],
	);

	useGesture(
		{
			onPinchStart: ({ cancel }) => {
				const element = room.current;
				if (!element || !api.getState().claim("zoom")) return cancel();
				measure(element);
				const offset = element.clientHeight / 2;
				setAnchor({ offset, minute: scale.minute(element.scrollTop + offset - DESIGN.labelLift) });
			},
			onPinch: ({ offset: [hourPx] }) => {
				if (api.getState().gesture === "zoom") api.getState().setZoom(hourPx);
			},
			onPinchEnd: ({ offset: [hourPx] }) => {
				if (api.getState().gesture !== "zoom") return;
				api.getState().setZoom(zoomAfterPinch(hourPx, fit.current ?? 0));
				api.getState().release("zoom");
				setAnchor(null);
			},
		},
		{
			target: room,
			eventOptions: { passive: false },
			pinch: {
				from: () => [scale.hourPx, 0],
				scaleBounds: () => ({ min: fit.current ?? scale.hourPx, max: most }),
				rubberband: false,
				pointer: { touch: true },
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
