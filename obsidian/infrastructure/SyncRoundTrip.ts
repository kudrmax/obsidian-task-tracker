import type { SyncControl, SyncOutcome } from "./SyncWait";

/** obsidian://task-calendar-sync: the iPhone app's Sync button. */
export const SYNC_ACTION = "task-calendar-sync";

export interface SyncRoundTripHost {
	/** Only the phone hands back to the app; the Mac just syncs. */
	readonly isPhone: boolean;
	open(url: string): void;
}

export interface SyncRoundTripDeps {
	readonly host: SyncRoundTripHost;
	readonly sync: SyncControl;
	readonly wait: { run(): Promise<SyncOutcome> };
}

/** The app sends the phone to Obsidian to sync; once Sync has finished or can't, Obsidian sends it back with the result. */
export class SyncRoundTrip {
	private waiting: Promise<void> | null = null;

	constructor(private readonly deps: SyncRoundTripDeps) {}

	/** A second tap while one wait is going joins it: the app gets one answer. */
	run(): void {
		if (!this.deps.host.isPhone) return this.deps.sync.request();
		this.waiting ??= this.deps.wait.run().then((outcome) => {
			this.waiting = null;
			this.deps.host.open(backLink(outcome));
		});
	}
}

export function backLink(outcome: SyncOutcome): string {
	return outcome.synced ? "taskcalendar://synced" : `taskcalendar://synced?error=${encodeURIComponent(outcome.reason)}`;
}
