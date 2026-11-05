import type { EventCache, KeptDay } from "../../src/application/ports";
import type { LocalDate } from "../../src/domain/Task";

/** The device's events cache as a map; `writes` and `reads` count how often it was saved and read. */
export class MemoryEventCache implements EventCache {
	writes = 0;
	reads = 0;

	constructor(public days: ReadonlyMap<LocalDate, KeptDay> = new Map()) {}

	read(): ReadonlyMap<LocalDate, KeptDay> {
		this.reads++;
		return this.days;
	}

	write(days: ReadonlyMap<LocalDate, KeptDay>): void {
		this.days = new Map(days);
		this.writes++;
	}
}
