import type { DayBoundary, DayOpening, DayService } from "../../src/application/contracts";
import { dayOpening } from "../../src/application/DayServiceImpl";
import type { Clock, SettingsStore } from "../../src/application/ports";
import { DayBoundary as Boundary } from "../../src/domain/DayBoundary";
import { type DayRelation, dayRelation } from "../../src/domain/Days";
import { addDays } from "../../src/domain/LocalDate";
import type { LocalDate } from "../../src/domain/Task";

/** The board's day: the clock stands still, so today never passes. */
export class DemoDayService implements DayService {
	constructor(
		private readonly clock: Clock,
		private readonly settings: SettingsStore,
	) {}

	today(): LocalDate {
		return this.boundary().dayOf(this.clock.now());
	}

	boundary(): DayBoundary {
		return new Boundary(this.settings.get().dayStartHour);
	}

	relation(date: LocalDate): DayRelation {
		return dayRelation(date, this.today());
	}

	step(date: LocalDate, days: number): LocalDate {
		return addDays(date, days);
	}

	openAt(date: LocalDate): DayOpening {
		return dayOpening(date, this.boundary(), this.today(), this.clock.now(), this.settings.get().scrollToHour);
	}

	onDayChange(): () => void {
		return () => undefined;
	}

	catchUp(): void {}
}
