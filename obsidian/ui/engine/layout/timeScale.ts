import { DESIGN } from "../../design";

/**
 * The time scale (spec, «Time scale»): the one minute↔pixel function at the current zoom. The timeline's hours, every
 * block, the now line (and later the drop, resize and zoom) place themselves through it and nothing else.
 */
export class TimeScale {
	constructor(readonly hourPx: number) {}

	/** A minute from the day's start, in pixels from the day's top. */
	y(minute: number): number {
		return (minute / 60) * this.hourPx;
	}

	/** An hour's label within this many pixels of the now line would lie under its pill: it is hidden (the design's label lift and pill). */
	static readonly NEAR_NOW = DESIGN.labelLift + DESIGN.nowPillHeight / 2;

	/** The minute from the day's start at `y` pixels from the day's top. */
	minute(y: number): number {
		return (y / this.hourPx) * 60;
	}
}

/** The scale at the base zoom (zoom comes with E3). */
export const BASE_SCALE = new TimeScale(DESIGN.hourPx);
