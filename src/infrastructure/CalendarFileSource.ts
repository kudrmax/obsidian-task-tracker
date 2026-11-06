import { type CalendarFile, readCalendarFile } from "../application/calendarFile";
import type { CalendarSource } from "../application/contracts";
import { type EventFile, SourceProblemError } from "../application/EventSource";
import type { PathWatcher } from "./VaultPathWatcher";

export interface CalendarFileAdapter {
	stat(path: string): Promise<{ readonly mtime: number; readonly size: number } | null>;
	read(path: string): Promise<string>;
}

/** A writer's JSON in the vault, at the path the settings give. */
export class CalendarFileSource implements EventFile {
	private kept: { readonly path: string; readonly mtime: number; readonly size: number; readonly text: string } | null = null;

	constructor(
		readonly name: CalendarSource,
		private readonly path: () => string,
		private readonly adapter: CalendarFileAdapter,
		private readonly watcher: PathWatcher,
	) {}

	onChange(listener: () => void): () => void {
		return this.watcher.watch(this.path, listener);
	}

	async read(): Promise<CalendarFile> {
		return readCalendarFile(await this.text(this.path()), this.name);
	}

	/** Read again only when the file's time or size changed. */
	private async text(path: string): Promise<string> {
		const stat = await this.adapter.stat(path);
		if (!stat) throw new SourceProblemError({ kind: "fileMissing" }, "file missing");
		const kept = this.kept;
		if (kept && kept.path === path && kept.mtime === stat.mtime && kept.size === stat.size) return kept.text;
		const text = await this.adapter.read(path);
		readCalendarFile(text, this.name);
		this.kept = { path, mtime: stat.mtime, size: stat.size, text };
		return text;
	}
}
