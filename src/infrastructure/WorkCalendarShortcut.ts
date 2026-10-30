export const WORK_CALENDAR_SHORTCUT = "Export Work Calendar";

export interface WorkCalendarShortcutHost {
	/** The phone runs Shortcuts; elsewhere the work file only arrives through Sync. */
	readonly isPhone: boolean;
	readonly vaultName: string;
	open(url: string): void;
}

/** Runs the Shortcuts shortcut that exports the work calendar; Shortcuts comes up for a moment and returns to the vault. */
export class WorkCalendarShortcut {
	constructor(private readonly host: WorkCalendarShortcutHost) {}

	run(): void {
		if (!this.host.isPhone) return;
		const back = `obsidian://open?vault=${encodeURIComponent(this.host.vaultName)}`;
		this.host.open(`shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(WORK_CALENDAR_SHORTCUT)}&x-success=${encodeURIComponent(back)}`);
	}
}
