import { DESIGN, LAYOUT } from "../../design";

/** A grid line between the hours: its minute from the day's start, and its label (`:30`) when it is a labelled one. */
export interface GridMark {
	readonly minute: number;
	readonly label: string | null;
}

/**
 * The time scale (spec, «Time scale»): the one minute↔pixel function at the current zoom. The timeline's hours and their
 * finer marks, every block and event, the now line, the drop, resize and zoom place themselves through it and nothing
 * else. The snap and the grid follow the hour's height (the design's «Шаг привязки» and «Деления между часами»).
 */
export class TimeScale {
	constructor(readonly hourPx: number) {}

	static readonly DAY = 24 * 60;
	/** The steps a carried task, a resize and a long tap snap to, finest first (the design's «Шаг привязки»: 10 is left out). */
	static readonly STEPS: readonly number[] = [5, 15, 30, 60];
	/** An hour's label within this many pixels of the now line would lie under its pill: it is hidden (the design's label lift and pill). */
	static readonly NEAR_NOW = DESIGN.labelLift + DESIGN.nowPillHeight / 2;

	/** A minute from the day's start, in pixels from the day's top. */
	y(minute: number): number {
		return (minute / 60) * this.hourPx;
	}

	/** The minute from the day's start at `y` pixels from the day's top. */
	minute(y: number): number {
		return (y / this.hourPx) * 60;
	}

	/** The snap step at this zoom: the finest step a finger moves at least the snap tolerance for (28 px an hour: 30 min, 56: 15, from 108: 5). */
	get step(): number {
		return TimeScale.STEPS.find((minutes) => this.y(minutes) >= LAYOUT.snapTolerance) ?? TimeScale.STEPS[TimeScale.STEPS.length - 1];
	}

	/** The nearest step to `minute`, within the day. */
	snap(minute: number): number {
		const step = this.step;
		return Math.max(0, Math.min(TimeScale.DAY, Math.round(minute / step) * step));
	}

	/** The start a carried task's top at `y` pixels takes: the nearest step, a step before the day's end at the latest. */
	start(y: number): number {
		return Math.min(TimeScale.DAY - this.step, this.snap(this.minute(y)));
	}

	/** The marks between the hours at this zoom: labels at the finest division with room for them, bare lines every 5 minutes once they stand apart. */
	marks(): readonly GridMark[] {
		const labels = LAYOUT.gridDivisions.find((minutes) => this.y(minutes) >= LAYOUT.gridLabelGap) ?? 60;
		const lines = this.y(LAYOUT.gridTickMinutes) >= LAYOUT.gridTickGap ? LAYOUT.gridTickMinutes : labels;
		const marks: GridMark[] = [];
		for (let minute = lines; minute < TimeScale.DAY; minute += lines) {
			const within = minute % 60;
			if (within !== 0) marks.push({ minute, label: within % labels === 0 ? `:${String(within).padStart(2, "0")}` : null });
		}
		return marks;
	}

	/** The scale whose hour is `hourPx`, held between the whole day (`least`) and the largest hour (`most`). */
	static within(hourPx: number, least: number, most: number): TimeScale {
		return new TimeScale(Math.max(least, Math.min(most, hourPx)));
	}
}

/** The scale at the base zoom. */
export const BASE_SCALE = new TimeScale(DESIGN.hourPx);
