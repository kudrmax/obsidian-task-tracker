import type { Clock } from "../../src/application/ports";

/** The board's moment: Friday 30 October 2026, 14:20, local time. */
export const DEMO_NOW = new Date(2026, 9, 30, 14, 20);

export class FixedClock implements Clock {
	constructor(private readonly at: Date) {}

	now(): Date {
		return new Date(this.at);
	}
}
