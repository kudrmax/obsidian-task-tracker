import type { DayBoundary } from "../domain/DayBoundary";
import { type DayRelation, dayRelation } from "../domain/Days";
import { addDays } from "../domain/LocalDate";
import { type FunnelAt, type ScreenAt, stepFunnel, stepScreen } from "./screenPlaces";
import type { LocalDate } from "../domain/Task";
import type { DayChange, DayOpening, DayService, TaskService } from "./contracts";
import { boundaryOf } from "./documentText";
import type { Clock, SettingsStore, Ticker } from "./ports";

const MINUTE_MS = 60_000;

/** Where `date`'s timeline opens: today on the now line, another day at `hour`. */
export function dayOpening(date: LocalDate, boundary: DayBoundary, today: LocalDate, now: Date, hour: number): DayOpening {
	return date === today ? { kind: "now", minute: boundary.offsetOf(date, now) } : { kind: "hour", minute: boundary.offsetOfHour(hour) };
}

type Listener = (change: DayChange) => void;

/** Today by the clock and the settings; once a minute, while anyone listens, it checks whether the day has passed. */
export class DayServiceImpl implements DayService {
	private readonly listeners = new Map<Listener, () => boolean>();
	/** The day the last check saw as today. */
	private seen: LocalDate | null = null;
	/** The hour the day started at when last looked. */
	private hour = 0;
	/** A minute's check came while a listener was not ready: it runs as soon as one catches up. */
	private missed = false;
	private stop: (() => void) | null = null;

	constructor(
		private readonly clock: Clock,
		private readonly settings: SettingsStore,
		private readonly tasks: Pick<TaskService, "normalize">,
		private readonly ticker: Ticker,
	) {}

	today(): LocalDate {
		return this.boundary().dayOf(this.clock.now());
	}

	boundary(): DayBoundary {
		return boundaryOf(this.settings.get());
	}

	relation(date: LocalDate): DayRelation {
		return dayRelation(date, this.today());
	}

	step(date: LocalDate, days: number): LocalDate {
		return addDays(date, days);
	}

	stepScreen(from: ScreenAt, shift: -1 | 1): ScreenAt | null {
		return stepScreen(from, shift, this.today());
	}

	stepFunnel(from: FunnelAt, shift: -1 | 1): FunnelAt | null {
		return stepFunnel(from, shift, this.today());
	}

	openAt(date: LocalDate): DayOpening {
		return dayOpening(date, this.boundary(), this.today(), this.clock.now(), this.settings.get().scrollToHour);
	}

	onDayChange(listener: Listener, ready: () => boolean = () => true): () => void {
		if (this.listeners.size === 0) this.watch();
		this.listeners.set(listener, ready);
		return () => {
			if (!this.listeners.delete(listener) || this.listeners.size > 0) return;
			this.stop?.();
			this.stop = null;
		};
	}

	catchUp(): void {
		if (this.missed) void this.check();
	}

	private watch(): void {
		this.seen = this.today();
		this.hour = this.settings.get().dayStartHour;
		this.missed = false;
		const stopTicks = this.ticker.every(MINUTE_MS, () => void this.check());
		const stopSettings = this.settings.onChange(() => this.settingsChanged());
		this.stop = () => {
			stopTicks();
			stopSettings();
		};
	}

	/** The day passed: the tasks file is normalized, then the listeners hear it. A listener not ready makes the check wait. */
	private async check(): Promise<void> {
		if (![...this.listeners.values()].every((ready) => ready())) {
			this.missed = true;
			return;
		}
		this.missed = false;
		const today = this.today();
		if (today === this.seen) return;
		this.seen = today;
		try {
			await this.tasks.normalize();
		} finally {
			this.emit("passed");
		}
	}

	private settingsChanged(): void {
		const hour = this.settings.get().dayStartHour;
		if (hour === this.hour) return;
		this.hour = hour;
		this.seen = this.today();
		this.emit("moved");
	}

	private emit(change: DayChange): void {
		for (const listener of [...this.listeners.keys()]) listener(change);
	}
}
