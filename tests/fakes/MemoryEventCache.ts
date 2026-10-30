import type { DayEvents } from "../../src/application/contracts";
import type { EventCache } from "../../src/application/ports";
import type { LocalDate } from "../../src/domain/Task";

/** The device's events cache as a map; `writes` counts how often it was saved. */
export class MemoryEventCache implements EventCache {
	writes = 0;

	constructor(public days: ReadonlyMap<LocalDate, DayEvents> = new Map()) {}

	read(): ReadonlyMap<LocalDate, DayEvents> {
		return this.days;
	}

	write(days: ReadonlyMap<LocalDate, DayEvents>): void {
		this.days = new Map(days);
		this.writes++;
	}
}
