import type { EventRef, TAbstractFile } from "obsidian";
import type { CalendarTexts } from "./CalendarLane";

/** What the calendar files are read through: Obsidian's `DataAdapter`. */
export interface TextAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
}

/** The vault's file events, as Obsidian's `Vault` gives them. */
export interface FileEvents {
	on(name: "modify" | "create" | "delete", callback: (file: TAbstractFile) => void): EventRef;
	on(name: "rename", callback: (file: TAbstractFile, oldPath: string) => void): EventRef;
	offref(ref: EventRef): void;
}

/** The calendars' files in the vault: a file missing reads as none; one that is there is handed to the core as it is. */
export class VaultCalendarTexts implements CalendarTexts {
	constructor(
		private readonly adapter: TextAdapter,
		private readonly events: FileEvents,
	) {}

	async read(path: string): Promise<string | null> {
		return (await this.adapter.exists(path)) ? this.adapter.read(path) : null;
	}

	watch(listener: (path: string) => void): () => void {
		const refs = [
			this.events.on("modify", (f) => listener(f.path)),
			this.events.on("create", (f) => listener(f.path)),
			this.events.on("delete", (f) => listener(f.path)),
			this.events.on("rename", (f, oldPath) => {
				listener(f.path);
				listener(oldPath);
			}),
		];
		return () => refs.forEach((ref) => this.events.offref(ref));
	}
}
