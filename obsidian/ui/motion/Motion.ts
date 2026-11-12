import { DURATION, EASING, tokenMs } from "../design";
import { px } from "../dom";

/** How long a move takes and on which curve, both read from the stylesheet's motion tokens; null where nothing moves (no sheet, as in a test). */
export interface Timing {
	readonly duration: number;
	readonly easing: string;
}

export type DurationToken = (typeof DURATION)[keyof typeof DURATION];

/** The motion tokens of `el`: a duration and the one curve every list and overlay move takes. */
export function timingOf(el: HTMLElement, duration: DurationToken = DURATION.collapse): Timing | null {
	const ms = tokenMs(el, duration);
	if (ms <= 0 || typeof el.animate !== "function") return null;
	return { duration: ms, easing: getComputedStyle(el).getPropertyValue(EASING.out).trim() || "ease-out" };
}

/** How far a transform running on `el` shifts it now: a translation's x and y, none for no transform. */
function shiftOf(el: Element): { readonly x: number; readonly y: number } {
	const values = /matrix(3d)?\(([^)]*)\)/.exec(getComputedStyle(el).transform ?? "");
	if (!values) return { x: 0, y: 0 };
	const parts = values[2].split(",").map(Number);
	return values[1] ? { x: parts[12] || 0, y: parts[13] || 0 } : { x: parts[4] || 0, y: parts[5] || 0 };
}

/**
 * Where `el` will stand once what moves it now has ended: its box less the shift a slide still draws, at the height it
 * grows to, at the place and size it is reshaped to. Read without stopping any of it, so nothing on the screen jumps.
 */
export function restingRect(el: HTMLElement): DOMRect {
	const rect = el.getBoundingClientRect();
	const shift = shiftOf(el);
	const growing = GROWN.get(el);
	const reshaped = RESHAPED.get(el);
	if (reshaped && SLIDES.get(el)?.playState === "running") {
		const now = boxOf(el);
		return new DOMRect(rect.left + reshaped.left - now.left, rect.top + reshaped.top - now.top, rect.width, reshaped.height);
	}
	const height = growing !== undefined && GROWTHS.get(el)?.playState === "running" ? growing : rect.height;
	const width = SLIDES.get(el)?.playState === "running" ? (SLID_TO.get(el) ?? rect.width) : rect.width;
	return new DOMRect(rect.left - shift.x, rect.top - shift.y + settling(el), width, height);
}

/** The row gap of the flex column `el` stands in: a row folded to nothing gives it back with a negative margin. */
function gapOf(el: HTMLElement): number {
	const parent = el.parentElement;
	return parent ? parseFloat(getComputedStyle(parent).rowGap) || 0 : 0;
}

/** How far a box that holds rows still moves down as its own height change settles (a row of the rows' stack), and until when. */
const SETTLES = new WeakMap<Element, { readonly dy: number; readonly until: number }>();

/** How far the boxes `el` stands in still move it, as their height changes settle. */
function settling(el: Element): number {
	let dy = 0;
	const now = performance.now();
	for (let box = el.parentElement; box; box = box.parentElement) {
		const settle = SETTLES.get(box);
		if (settle && settle.until > now) dy += settle.dy;
	}
	return dy;
}

const SLIDES = new WeakMap<Element, Animation>();
const GROWTHS = new WeakMap<Element, Animation>();
/** The height a growing row grows to, and the box a reshaped one goes to. */
const GROWN = new WeakMap<Element, number>();
const RESHAPED = new WeakMap<Element, Box>();
const SLID_TO = new WeakMap<Element, number>();
const GROWN_MARGIN = new WeakMap<Element, number>();

/** The bottom margin `el` will stand with once it has grown in (it grows from none): its own otherwise. */
export function restingMarginBottom(el: HTMLElement): number {
	const grown = GROWN_MARGIN.get(el);
	if (grown !== undefined && GROWTHS.get(el)?.playState === "running") return grown;
	return parseFloat(getComputedStyle(el).marginBottom) || 0;
}

/**
 * The moves a row of a list makes, and anything that floats over the screen: it grows in from nothing, fades and then
 * folds away, slides from where it stood to where it stands. Every duration and the curve are the stylesheet's tokens;
 * with none (a test) the change is simply made.
 */
export const Motion = {
	/** A row comes in: from no height and no opacity to its own, the rows under it sliding down as it grows. */
	enter(row: HTMLElement): void {
		const timing = timingOf(row);
		if (!timing) return;
		const style = getComputedStyle(row);
		const to = { height: style.height, minHeight: style.minHeight, marginTop: style.marginTop, marginBottom: style.marginBottom, opacity: "1" };
		const overflow = row.style.overflow;
		row.style.overflow = "hidden";
		const growth = row.animate([{ height: "0px", minHeight: "0px", marginTop: "0px", marginBottom: px(-gapOf(row)), opacity: "0" }, to], timing);
		GROWTHS.set(row, growth);
		GROWN.set(row, parseFloat(to.height) || 0);
		GROWN_MARGIN.set(row, parseFloat(to.marginBottom) || 0);
		const done = () => {
			if (GROWTHS.get(row) === growth) row.style.overflow = overflow;
		};
		growth.addEventListener("finish", done);
		growth.addEventListener("cancel", done);
	},

	/**
	 * A row goes: it fades where it stands, then folds away as the rows under it close up; `gone` runs once it has left
	 * the page. A place that only marked where something lands (`fade` false) folds and fades at once.
	 */
	leave(row: HTMLElement, gone: () => void, fade = true): Animation | null {
		const timing = timingOf(row);
		row.classList.add("is-leaving");
		if (!timing) {
			row.remove();
			gone();
			return null;
		}
		const style = getComputedStyle(row);
		const full = { height: style.height, minHeight: style.minHeight, marginTop: style.marginTop, marginBottom: style.marginBottom };
		row.style.overflow = "hidden";
		const folded = { height: "0px", minHeight: "0px", marginTop: "0px", marginBottom: px(-gapOf(row)), opacity: "0" };
		const leaving = fade
			? row.animate(
					[
						{ ...full, opacity: "1", easing: timing.easing },
						{ ...full, opacity: "0", easing: timing.easing, offset: 0.5 },
						folded,
					],
					{ duration: 2 * timing.duration, fill: "forwards" },
				)
			: row.animate([{ ...full, opacity: "1" }, folded], { ...timing, fill: "forwards" });
		leaving.addEventListener("finish", () => {
			row.remove();
			gone();
		});
		return leaving;
	},

	/** Calls a leave off: the row stays, as it stands. */
	stay(row: HTMLElement, leaving: Animation | null): void {
		leaving?.cancel();
		row.classList.remove("is-leaving");
		row.style.overflow = "";
	},

	/** A row moved: it is drawn where it stood (`from`, read before the move) and slides to where it stands now, taking its new width (a new level) on the way. */
	slide(row: HTMLElement, from: DOMRect, duration: DurationToken = DURATION.collapse): void {
		const timing = timingOf(row, duration);
		if (!timing) return;
		SLIDES.get(row)?.cancel();
		const to = row.getBoundingClientRect();
		const dx = from.left - to.left;
		const dy = from.top - to.top;
		const resized = Math.abs(from.width - to.width) >= 0.5;
		if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !resized) return;
		const width = resized ? [{ width: px(from.width) }, { width: px(to.width) }] : [{}, {}];
		SLID_TO.set(row, to.width);
		SLIDES.set(row, row.animate([{ transform: `translate(${dx}px, ${dy}px)`, ...width[0] }, { transform: "none", ...width[1] }], timing));
	},

	/** Whatever slides on `row` stops where it would have ended: its box can be read where it stands. */
	settle(row: Element): void {
		SLIDES.get(row)?.cancel();
		GROWTHS.get(row)?.finish();
	},

	/** Something absolutely placed changed its box: it moves and resizes from the old box (`from`, in its own `top`, `left` and `height`) to the new one. */
	reshape(node: HTMLElement, from: Box, duration: DurationToken = DURATION.collapse): void {
		const timing = timingOf(node, duration);
		if (!timing) return;
		SLIDES.get(node)?.cancel();
		const to = boxOf(node);
		if (Math.abs(to.top - from.top) < 0.5 && Math.abs(to.left - from.left) < 0.5 && Math.abs(to.height - from.height) < 0.5) return;
		RESHAPED.set(node, to);
		SLIDES.set(node, node.animate([{ top: px(from.top), left: px(from.left), height: px(from.height) }, { top: px(to.top), left: px(to.left), height: px(to.height) }], timing));
	},

	/**
	 * A box moves `dy` down over `ms` as heights above it settle (a CSS transition the code started): whatever stands in it
	 * is read where it will rest (`restingRect`), so a card landing in it lands where it ends up.
	 */
	settles(box: Element, dy: number, ms: number): void {
		if (Math.abs(dy) < 0.5) SETTLES.delete(box);
		else SETTLES.set(box, { dy, until: performance.now() + ms });
	},

	/** A row standing in for another of its height (a list's plate) grows only the room under it (a field's bar room), if it keeps any. */
	growRoomUnder(row: HTMLElement): void {
		const timing = timingOf(row);
		const room = getComputedStyle(row).marginBottom;
		if (!timing || !(parseFloat(room) > 0)) return;
		row.animate([{ marginBottom: "0px" }, { marginBottom: room }], timing);
	},

	/** Something floating comes in where it stands: it fades in. */
	appear(node: HTMLElement, duration: DurationToken = DURATION.collapse): void {
		const timing = timingOf(node, duration);
		if (timing) node.animate([{ opacity: "0" }, { opacity: "1" }], timing);
	},

	/** Something floating goes: it fades, then `gone` takes it away. */
	disappear(node: HTMLElement, gone: () => void, duration: DurationToken = DURATION.collapse): void {
		const timing = timingOf(node, duration);
		if (!timing) return gone();
		node.style.pointerEvents = "none";
		node.animate([{ opacity: getComputedStyle(node).opacity }, { opacity: "0" }], { ...timing, fill: "forwards" }).addEventListener("finish", gone);
	},
};

/** An absolutely placed box in its parent's pixels, as its own `top`, `left` and `height` lay it out. */
export interface Box {
	readonly top: number;
	readonly left: number;
	readonly height: number;
}

export function boxOf(node: HTMLElement): Box {
	const style = getComputedStyle(node);
	return { top: parseFloat(style.top) || 0, left: parseFloat(style.left) || 0, height: parseFloat(style.height) || 0 };
}
