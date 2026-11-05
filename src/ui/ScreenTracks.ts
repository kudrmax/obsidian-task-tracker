import { LAYOUT } from "./design";
import type { DayPeek } from "./DayPeek";
import { type Place, placeIndex, type Shift } from "./screens";
import type { ScreenTrack } from "./ScreenPager";

/** What stands on the strip and slides with it: the columns, the dividers between them and the headers over them. */
const STRIP = [".tc-done", ".tc-inbox", ".tc-soon", ".tc-left", ".tc-right", ".tc-divider", ".tc-head"];

export function stripParts(root: HTMLElement): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>(STRIP.map((part) => `:scope > ${part}`).join(", "))];
}

/** The strip's parts moved sideways together, as one sheet. */
function shiftParts(parts: readonly HTMLElement[], dx: number): void {
	for (const part of parts) part.style.transform = dx === 0 ? "" : `translate3d(${dx}px, 0, 0)`;
}

/** Past the row's end the screen gives a little, less and less the further it is drawn, and never a whole width. */
export function edgeGive(dx: number, width: number): number {
	if (width <= 0) return 0;
	return Math.sign(dx) * width * (1 - 1 / ((Math.abs(dx) * LAYOUT.swipeEdgeGive) / width + 1));
}

/** The row's end: no screen comes in, the screen gives a little and comes back. */
export class EdgeTrack implements ScreenTrack {
	readonly distance = null;

	constructor(
		private readonly parts: readonly HTMLElement[],
		private readonly width: number,
	) {}

	at(dx: number): void {
		shiftParts(this.parts, edgeGive(dx, this.width));
	}

	land(): void {
		shiftParts(this.parts, 0);
	}
}

/**
 * One column a day slides through: what shows the day goes out one side as the next day's comes in from the other, each
 * seen only in its own place in the column. What the column draws for every day, its hours and lines, stands still.
 */
export interface DayLane {
	/** Read again on every frame: a part drawn anew while the finger moves moves too. */
	readonly shown: () => readonly HTMLElement[];
	readonly next: () => readonly HTMLElement[];
	readonly width: number;
}

/** A part `dx` px from its place, seen only within its place: it slides in and out of it as through a window. */
function slide(part: HTMLElement, dx: number): void {
	if (dx === 0) return still(part);
	part.style.transform = `translate3d(${dx}px, 0, 0)`;
	part.style.clipPath = `inset(0 ${Math.max(0, dx)}px 0 ${Math.max(0, -dx)}px)`;
}

function still(part: HTMLElement): void {
	part.style.transform = "";
	part.style.clipPath = "";
}

/**
 * Another day: the header, the hours and the divider stand still; in each column the day slides out and the next comes
 * in, the `lead` column under the finger. The header names whichever day stands nearer. Arrived, what the screen
 * showed stays out of sight until the screen has drawn the day itself.
 */
export class DayTrack implements ScreenTrack {
	readonly distance: number;
	private nearer = false;

	constructor(
		private readonly lanes: readonly DayLane[],
		lead: DayLane,
		private readonly peek: DayPeek,
		private readonly shift: Shift,
		private readonly events: { onNearer(nearer: boolean): void; onArrive(peek: DayPeek, shown: readonly HTMLElement[]): void },
	) {
		this.distance = lead.width;
		this.at(0);
	}

	at(dx: number): void {
		const share = this.distance > 0 ? dx / this.distance : 0;
		for (const lane of this.lanes) {
			const offset = share * lane.width;
			for (const part of lane.shown()) slide(part, offset);
			for (const part of lane.next()) slide(part, this.shift * lane.width + offset);
		}
		const nearer = Math.abs(share) * 2 >= 1;
		if (nearer === this.nearer) return;
		this.nearer = nearer;
		this.events.onNearer(nearer);
	}

	land(arrived: boolean): void {
		const shown = this.lanes.flatMap((lane) => lane.shown());
		if (arrived) return this.events.onArrive(this.peek, shown);
		restore(shown);
		this.peek.remove();
		if (this.nearer) this.events.onNearer(false);
	}
}

/** What a swipe moved stands where it stood, as drawn. */
export function restore(parts: readonly HTMLElement[]): void {
	for (const part of parts) still(part);
}

export interface StripTrackDeps {
	readonly root: HTMLElement;
	readonly from: Place;
	readonly to: Place;
	/** Sets the classes of a place on the screen, with no slide. */
	showMode(place: Place): void;
	/** The switch's wheel turned to a place, a share of the way to the next one. */
	turnWheel(position: number): void;
	/** Arrived: the screen takes the place for good. */
	onArrive(place: Place): void;
}

/** The sides and sizes that differ from one place of the strip to the next. */
const SLIDING = ["left", "marginLeft", "width", "paddingLeft", "paddingRight", "gap"] as const;
/** The strip's slide is drawn as a still animation the finger scrubs through, a share of this per share of the way. */
const SCRUB_MS = 1000;

type Look = Partial<Record<(typeof SLIDING)[number], string>>;

/**
 * Another pair of columns: the strip slides as the switch slides it, each part from where it stands at one place to where
 * it stands at the next, the finger carrying it any share of the way, and the switch's wheel turns with it.
 */
export class StripTrack implements ScreenTrack {
	readonly distance: number;
	private readonly animations: Animation[] = [];
	private readonly fromPlace: number;
	private readonly way: number;

	constructor(private readonly deps: StripTrackDeps) {
		const root = deps.root;
		const parts = [...stripParts(root), ...root.querySelectorAll<HTMLElement>(":scope > .tc-day-nav .tc-arrow")];
		const before = parts.map(lookOf);
		deps.showMode(deps.to);
		const after = parts.map(lookOf);
		deps.showMode(deps.from);
		this.fromPlace = placeIndex(deps.from);
		this.way = placeIndex(deps.to) - this.fromPlace;
		const soon = parts.findIndex((part) => part.classList.contains("tc-soon"));
		this.distance = soon < 0 ? root.clientWidth : Math.abs(offsetOf(after[soon]) - offsetOf(before[soon]));
		parts.forEach((part, i) => {
			const [start, end] = changed(before[i], after[i]);
			if (Object.keys(start).length === 0) return;
			const animation = part.animate([start, end], { duration: SCRUB_MS, fill: "both", easing: "linear" });
			animation.pause();
			animation.currentTime = 0;
			this.animations.push(animation);
		});
	}

	at(dx: number): void {
		const share = this.distance > 0 ? Math.min(1, Math.max(0, (-this.way * dx) / this.distance)) : 0;
		for (const animation of this.animations) animation.currentTime = share * SCRUB_MS;
		this.deps.turnWheel(this.fromPlace + this.way * share);
	}

	land(arrived: boolean): void {
		if (arrived) this.deps.onArrive(this.deps.to);
		else this.deps.turnWheel(this.fromPlace);
		for (const animation of this.animations) animation.cancel();
	}
}

/** How far from the window's edge a part stands: its left side and the margin that moves the strip to Done. */
function offsetOf(look: Look): number {
	return parseFloat(look.left ?? "0") + (parseFloat(look.marginLeft ?? "0") || 0);
}

function lookOf(part: HTMLElement): Look {
	const style = getComputedStyle(part);
	return Object.fromEntries(SLIDING.map((name) => [name, style[name]]));
}

function changed(before: Look, after: Look): [Keyframe, Keyframe] {
	const start: Keyframe = {};
	const end: Keyframe = {};
	for (const name of SLIDING) {
		if (before[name] === after[name]) continue;
		start[name] = before[name];
		end[name] = after[name];
	}
	return [start, end];
}
