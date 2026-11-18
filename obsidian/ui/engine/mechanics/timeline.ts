/** The timeline's geometry: minutes to heights, the snap by zoom, the finer marks, the stack of blocks, the events' depth. */

const HOUR = 60;
export const DAY_HOURS = 24;

export const toPx = (minute: number, hourPx: number) => (minute / HOUR) * hourPx;
export const toMinute = (px: number, hourPx: number) => (px / hourPx) * HOUR;

/** The step a drop snaps to: 30 minutes at a small zoom, 15 at a normal one, 5 at a large one. */
export function snapStep(hourPx: number): number {
	return hourPx < 48 ? 30 : hourPx < 96 ? 15 : 5;
}

/** A minute snapped to the step of this zoom, within the day. */
export function snap(minute: number, hourPx: number): number {
	const step = snapStep(hourPx);
	return Math.max(0, Math.min(DAY_HOURS * HOUR - step, Math.round(minute / step) * step));
}

/** A mark between the hours: its minute and its label (null: a bare line). */
export interface Mark {
	readonly minute: number;
	readonly label: string | null;
}

/** The marks between the hours the zoom gives room for: half hours labelled from 96 px an hour, quarters as lines from 64, labelled from 160. */
export function marks(hourPx: number, clock: (minute: number) => string): Mark[] {
	const every = hourPx >= 64 ? 15 : hourPx >= 40 ? 30 : 0;
	if (every === 0) return [];
	const out: Mark[] = [];
	for (let minute = every; minute < DAY_HOURS * HOUR; minute += every) {
		if (minute % HOUR === 0) continue;
		const labelled = minute % 30 === 0 ? hourPx >= 96 : hourPx >= 160;
		out.push({ minute, label: labelled ? clock(minute) : null });
	}
	return out;
}

/** An hour's label hides under the now pill when closer than its own lift and half the pill. */
export function hidesUnderNow(y: number, nowY: number | null, lift: number, pill: number): boolean {
	return nowY !== null && Math.abs(y - nowY) < lift + pill / 2;
}

/** A block's span: minutes from the day's start; no end, no duration. */
export interface Span {
	readonly start: number;
	readonly end: number | null;
}

/** Where a block stands: its top and height, its left inset, whether it shows its start (stacked) or its duration (shorter than a card). */
export interface Box {
	readonly top: number;
	readonly height: number;
	readonly left: number;
	readonly stacked: boolean;
	readonly short: boolean;
}

/**
 * The blocks stacked: each on its time, a card high at least (its duration's height when longer); one that would start
 * inside the card before it stands a gap under it instead and shows its start; one lying on a longer block's body is
 * inset from the left so both read. In the order given; the stack goes by start, ties in that order.
 */
export function stack(spans: readonly Span[], hourPx: number, card: { readonly height: number; readonly gap: number }, inset: { readonly item: number; readonly overlay: number }): Box[] {
	const order = spans.map((span, i) => ({ span, i })).sort((a, b) => a.span.start - b.span.start || a.i - b.i);
	const boxes: Box[] = new Array(spans.length);
	let headBottom = -Infinity;
	const bodies: { readonly top: number; readonly bottom: number }[] = [];
	for (const { span, i } of order) {
		const natural = toPx(span.start, hourPx) + inset.item;
		const length = span.end === null ? 0 : toPx(span.end - span.start, hourPx) - 2 * inset.item;
		const top = Math.max(natural, headBottom + card.gap);
		const height = Math.max(card.height, length);
		const onBody = bodies.some((body) => top >= body.top && top < body.bottom);
		boxes[i] = { top, height, left: onBody ? inset.overlay : 0, stacked: top > natural + 0.5, short: span.end !== null && length < card.height };
		headBottom = top + card.height;
		if (height > card.height) bodies.push({ top: top + card.height, bottom: top + height });
	}
	return boxes;
}

/** How deep each event lies over the ones before it that it overlaps (0: none), for its left inset. In the order given. */
export function eventDepths(spans: readonly { readonly start: number; readonly end: number }[]): number[] {
	return spans.map((span, i) => spans.slice(0, i).filter((other) => other.start < span.end && span.start < other.end).length);
}

/** The scroll that puts `minute` at `fraction` of the visible height, and the room a minute near the day's edge needs. */
export function opening(minute: number, fraction: number, hourPx: number, visible: number): { readonly scrollTop: number; readonly roomTop: number; readonly roomBottom: number } {
	const day = DAY_HOURS * hourPx;
	const y = toPx(minute, hourPx);
	const above = fraction * visible;
	const roomTop = Math.max(0, above - y);
	const roomBottom = Math.max(0, visible - above - (day - y));
	return { scrollTop: Math.max(0, roomTop + y - above), roomTop, roomBottom };
}

/** An event's colours in the theme: its ground (its colour, see-through), its bar, its words. */
export function eventPaint(hex: string, theme: "dark" | "light"): { readonly bg: string; readonly bar: string; readonly text: string } {
	const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
	const alpha = theme === "dark" ? 0.32 : 0.2;
	return { bg: `rgba(${r}, ${g}, ${b}, ${alpha})`, bar: hex, text: theme === "dark" ? `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})` : `rgb(${sink(r)}, ${sink(g)}, ${sink(b)})` };
}

const lift = (c: number) => Math.round(c + (255 - c) * 0.55);
const sink = (c: number) => Math.round(c * 0.55);
