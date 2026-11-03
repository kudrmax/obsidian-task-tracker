import type { RightMode } from "../settings";
import { LAYOUT } from "./design";
import type { DayPeek } from "./DayPeek";
import { PLACES, type Shift } from "./screens";
import type { ScreenTrack } from "./ScreenPager";

/** What stands on the strip and slides with it: the columns, the dividers between them and the headers over them. */
const STRIP = [".tc-inbox", ".tc-soon", ".tc-left", ".tc-right", ".tc-divider", ".tc-head"];

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
 * One part of the screen a day slides through: what it shows goes out one side as the next day's comes in from the
 * other, within its own column. A header that no column holds fades as it goes.
 */
export interface DayLane {
	readonly shown: readonly HTMLElement[];
	readonly next: readonly HTMLElement[];
	readonly width: number;
	readonly fades?: boolean;
}

/**
 * Another day: the list stays the list and the timeline the timeline, the divider standing still between them; in each
 * column the day slides out and the next comes in, the `lead` column under the finger. Arrived, what the screen showed
 * stays out of sight until the screen has drawn the day itself.
 */
export class DayTrack implements ScreenTrack {
	readonly distance: number;

	constructor(
		private readonly lanes: readonly DayLane[],
		lead: DayLane,
		private readonly peek: DayPeek,
		private readonly shift: Shift,
		private readonly onArrive: (peek: DayPeek, shown: readonly HTMLElement[]) => void,
	) {
		this.distance = lead.width;
		this.at(0);
	}

	at(dx: number): void {
		const share = this.distance > 0 ? dx / this.distance : 0;
		for (const lane of this.lanes) {
			const offset = share * lane.width;
			shiftParts(lane.shown, offset);
			shiftParts(lane.next, this.shift * lane.width + offset);
			if (!lane.fades) continue;
			for (const part of lane.shown) part.style.opacity = share === 0 ? "" : String(1 - Math.abs(share));
			for (const part of lane.next) part.style.opacity = String(Math.abs(share));
		}
	}

	land(arrived: boolean): void {
		const shown = this.lanes.flatMap((lane) => lane.shown);
		if (arrived) return this.onArrive(this.peek, shown);
		restore(shown);
		this.peek.remove();
	}
}

/** What a swipe moved stands where it stood, as drawn. */
export function restore(parts: readonly HTMLElement[]): void {
	for (const part of parts) {
		part.style.transform = "";
		part.style.opacity = "";
	}
}

export interface StripTrackDeps {
	readonly root: HTMLElement;
	readonly from: RightMode;
	readonly to: RightMode;
	/** Sets the classes of a place on the screen, with no slide. */
	showMode(mode: RightMode): void;
	/** The switch's wheel turned to a place, a share of the way to the next one. */
	turnWheel(position: number): void;
	/** Arrived: the screen takes the place for good. */
	onArrive(mode: RightMode): void;
}

/** The sides and sizes that differ from one place of the strip to the next. */
const SLIDING = ["left", "width", "paddingLeft", "paddingRight", "gap"] as const;
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
		this.fromPlace = PLACES.indexOf(deps.from);
		this.way = PLACES.indexOf(deps.to) - this.fromPlace;
		const soon = parts.findIndex((part) => part.classList.contains("tc-soon"));
		this.distance = soon < 0 ? root.clientWidth : Math.abs(parseFloat(after[soon].left ?? "0") - parseFloat(before[soon].left ?? "0"));
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
