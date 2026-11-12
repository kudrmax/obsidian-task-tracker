import { type FunnelAt, stepFunnel } from "../../core/application/screenPlaces";
import type { DayBoundary, DayOpening, DayService } from "../../core/application/contracts";
import { dayOpening } from "../../core/application/DayServiceImpl";
import type { Clock, SettingsStore } from "../../core/application/ports";
import { DayBoundary as Boundary } from "../../core/domain/DayBoundary";
import { type DayRelation, dayRelation } from "../../core/domain/Days";
import { addDays } from "../../core/domain/LocalDate";
import type { LocalDate } from "../../core/domain/Task";

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

	stepFunnel(from: FunnelAt, shift: -1 | 1): FunnelAt | null {
		return stepFunnel(from, shift, this.today());
	}

	openAt(date: LocalDate): DayOpening {
		return dayOpening(date, this.boundary(), this.today(), this.clock.now(), this.settings.get().scrollToHour);
	}

	onDayChange(): () => void {
		return () => undefined;
	}

	catchUp(): void {}
}
