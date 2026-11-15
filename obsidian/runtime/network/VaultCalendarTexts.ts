import type { CalendarTexts } from "./CalendarLane";

/** What the calendar files are read through: Obsidian's `DataAdapter`. */
export interface TextAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
}

/** The calendars' files in the vault: a file missing reads as none; one that is there is handed to the core as it is. */
export class VaultCalendarTexts implements CalendarTexts {
	constructor(private readonly adapter: TextAdapter) {}

	async read(path: string): Promise<string | null> {
		return (await this.adapter.exists(path)) ? this.adapter.read(path) : null;
	}
}
