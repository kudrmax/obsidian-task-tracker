import type { CalendarFile } from "../../core/application/calendarFile";
import type { WorkCalendarSetup } from "../../core/application/contracts";
import type { Clock, Timers } from "../../core/application/ports";
import type { WorkCalendarShortcutHost } from "./WorkCalendarShortcut";

/** Long enough for the app to write its file and hand the phone back to Obsidian; the timer runs on once Obsidian is back. */
const BACK_MS = 20_000;

export interface PhoneCalendarRefreshDeps {
	readonly host: WorkCalendarShortcutHost;
	readonly readIphone: () => Promise<CalendarFile | null>;
	readonly shortcut: { run(): void };
	readonly clock: Clock;
	readonly timers: Timers;
}

/**
 * Refresh now on the phone: the iPhone app writes the phone's calendars and comes back to Obsidian. Its signature ran
 * out, or it came back without writing: Scriptable exports them instead, so the button brings what it can.
 */
export class PhoneCalendarRefresh implements Pick<WorkCalendarSetup, "export"> {
	constructor(private readonly deps: PhoneCalendarRefreshDeps) {}

	export(): void {
		if (!this.deps.host.isPhone) return;
		void this.viaApp();
	}

	private async viaApp(): Promise<void> {
		const asked = this.deps.clock.now();
		const file = await this.deps.readIphone();
		if (!file?.validUntil || file.validUntil <= asked) {
			this.deps.shortcut.run();
			return;
		}
		this.deps.host.open(`taskcalendar://refresh?vault=${encodeURIComponent(this.deps.host.vaultName)}`);
		this.deps.timers.set(() => void this.checkBack(asked), BACK_MS);
	}

	private async checkBack(asked: Date): Promise<void> {
		const file = await this.deps.readIphone();
		if (!file || file.exportedAt < asked) this.deps.shortcut.run();
	}
}
