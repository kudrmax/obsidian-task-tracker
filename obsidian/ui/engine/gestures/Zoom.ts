import { useGesture } from "@use-gesture/react";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { DESIGN } from "../../shared/design";
import { TimeScale } from "../layout/timeScale";
import { useScreenApi, type Zoom } from "../store";

/**
 * The calendar's zoom (spec, «Gestures that are not drag» and «Time scale»): @use-gesture's pinch, which is two fingers on
 * the phone and Ctrl/Cmd + wheel or the trackpad's pinch on the Mac. It stops where it is let go, from the whole day on
 * screen to the largest hour. The minute under the pointer as the zoom begins (the mouse, the fingers' centre) stays under
 * it in every frame, following the fingers when they move together, as every zoom does and the plugin's did: once the
 * calendar is drawn at the new scale, before the frame is painted, its scroll offset is set to put that minute back under
 * the pointer (Max's exception to the guard, 2026-11-19). Let go at or under the whole day, the zoom is the whole day,
 * which keeps fitting the calendar's height as it changes (F98).
 */

/** What the zoom holds still: the minute from the day's start, and how far under the room's top the pointer stands. */
interface Anchor {
	readonly minute: number;
	y: number;
	/** The room's top on the page, read once as the zoom begins. */
	readonly roomTop: number;
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
 * The pinch on the calendar's room. `room` is the room, `foot` its probe of the foot's height; the day starts the label's
 * room under the room's content top; `scale` the scale drawn now; `most` the largest hour; `setMeasure` takes the room's
 * measure, taken as it mounts and whenever its size changes (Max's exception to the guard, 2026-11-19: one observer of the
 * room's own size). An interrupted pinch (the calendar unmounted mid-pinch) gives the pointer back and drops its anchor.
 * Returns the room's ref.
 */
export function useCalendarZoom(room: RefObject<HTMLElement | null>, foot: RefObject<HTMLElement | null>, scale: TimeScale, most: number, setMeasure: (measure: RoomMeasure) => void): (element: HTMLElement | null) => void {
	const api = useScreenApi();
	const fit = useRef<number | null>(null);
	const drawn = useRef(scale);
	drawn.current = scale;
	const anchor = useRef<Anchor | null>(null);
	const watch = useRef<{ disconnect(): void } | null>(null);

	/** The anchored minute put back under the pointer at the scale drawn; the browser stops the scroll at the day's ends. */
	const hold = useCallback(
		(at: TimeScale) => {
			const element = room.current;
			const held = anchor.current;
			if (!element || !held) return;
			element.scrollTop = DESIGN.labelLift + at.y(held.minute) - held.y;
		},
		[room],
	);

	/** Every scale drawn while a zoom holds a minute, the scroll follows in the same frame; the zoom over, its last scale is held once more and the anchor goes. */
	useLayoutEffect(() => {
		if (!anchor.current) return;
		hold(scale);
		if (api.getState().gesture !== "zoom") anchor.current = null;
	}, [scale, hold, api]);

	/** Stable, so the room's ref is set once, not again on every pinch step. */
	const measure = useCallback(
		(element: HTMLElement | null) => {
			watch.current?.disconnect();
			watch.current = null;
			const view = element?.ownerDocument.defaultView;
			if (!element || !view) return;
			let last: RoomMeasure | null = null;
			const take = () => {
				const next = roomMeasure(element.clientHeight, foot.current?.clientHeight ?? 0);
				if (last && last.visible === next.visible && last.fit === next.fit) return;
				last = next;
				fit.current = next.fit;
				setMeasure(next);
			};
			take();
			const observer = new view.ResizeObserver(take);
			observer.observe(element);
			watch.current = observer;
		},
		[foot, setMeasure],
	);

	useEffect(
		() => () => {
			if (api.getState().gesture === "zoom") api.getState().release("zoom");
			anchor.current = null;
		},
		[api],
	);

	useGesture(
		{
			onPinchStart: ({ origin: [, y], cancel }) => {
				const element = room.current;
				if (!element || !api.getState().claim("zoom")) return cancel();
				const roomTop = element.getBoundingClientRect().top;
				anchor.current = { roomTop, y: y - roomTop, minute: drawn.current.minute(element.scrollTop + y - roomTop - DESIGN.labelLift) };
			},
			onPinch: ({ offset: [hourPx], origin: [, y] }) => {
				const held = anchor.current;
				if (api.getState().gesture !== "zoom" || !held) return;
				held.y = y - held.roomTop;
				api.getState().setZoom(hourPx);
				/** The fingers moved together without changing the scale: nothing is drawn again, the scroll follows them now. */
				hold(drawn.current);
			},
			onPinchEnd: ({ offset: [hourPx] }) => {
				if (api.getState().gesture !== "zoom") return;
				const before = api.getState().zoom;
				api.getState().setZoom(zoomAfterPinch(hourPx, fit.current ?? 0));
				api.getState().release("zoom");
				/** Settling changed nothing drawn: no scale comes to hold it, so the anchor goes now. */
				if (api.getState().zoom === before) anchor.current = null;
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
