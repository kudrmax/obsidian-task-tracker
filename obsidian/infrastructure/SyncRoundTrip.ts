import type { SyncControl, SyncOutcome } from "./SyncWait";

/** obsidian://task-calendar-sync: the Tasks app's Sync button. */
export const SYNC_ACTION = "task-calendar-sync";

/** Shown while the phone waits for Sync; the app is called Tasks on the phone's screen. */
export const SYNC_NOTICE = "Syncing… back to Tasks when done";

export interface SyncRoundTripHost {
	/** Only the phone hands back to the app; the Mac just syncs. */
	readonly isPhone: boolean;
	open(url: string): void;
	/** Shows a notice until the returned hide is called. */
	notice(text: string): () => void;
}

export interface SyncRoundTripDeps {
	readonly host: SyncRoundTripHost;
	readonly sync: SyncControl;
	readonly wait: { run(): Promise<SyncOutcome> };
}

/**
 * The app sends the phone to Obsidian to sync; once Sync has finished or can't, Obsidian sends it back with the result.
 * Max leaving Obsidian first ends the round trip with no answer.
 */
export class SyncRoundTrip {
	private waiting: Promise<void> | null = null;

	constructor(private readonly deps: SyncRoundTripDeps) {}

	/** A second tap while one wait is going joins it: the app gets one answer. */
	run(): void {
		if (!this.deps.host.isPhone) return this.deps.sync.request();
		this.waiting ??= this.waitAndHandBack();
	}

	private async waitAndHandBack(): Promise<void> {
		const hide = this.deps.host.notice(SYNC_NOTICE);
		const outcome = await this.deps.wait.run();
		hide();
		this.waiting = null;
		const link = backLink(outcome);
		if (link) this.deps.host.open(link);
	}
}

export function backLink(outcome: SyncOutcome): string | null {
	switch (outcome.kind) {
		case "synced":
			return "taskcalendar://synced";
		case "failed":
			return `taskcalendar://synced?error=${encodeURIComponent(outcome.reason)}`;
		case "left":
			return null;
	}
}
