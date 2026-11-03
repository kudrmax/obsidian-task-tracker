import type { CalendarEvent } from "../application/contracts";
import type { EventBatch, EventSource } from "../application/EventSource";
import type { SettingsStore } from "../application/ports";
import type { PathWatcher } from "./VaultPathWatcher";

export interface WorkCalendarAdapter {
	stat(path: string): Promise<{ readonly mtime: number; readonly size: number } | null>;
	read(path: string): Promise<string>;
}

interface WorkEventDto {
	id: string;
	title: string;
	start: string;
	end: string;
	allDay: boolean;
	calendar: string;
	color?: string | null;
}

interface WorkCalendarFile {
	exportedAt: string;
	device?: string;
	events?: WorkEventDto[];
}

const DEFAULT_COLOR = "#0A84FF";

/** Reads the JSON that the Scriptable script drops into the vault. */
export class WorkCalendarFileSource implements EventSource {
	readonly name = "work" as const;
	private kept: { readonly path: string; readonly mtime: number; readonly size: number; readonly file: WorkCalendarFile } | null = null;

	constructor(
		private readonly adapter: WorkCalendarAdapter,
		private readonly settings: SettingsStore,
		private readonly watcher: PathWatcher,
	) {}

	/** Shortcuts or Sync brought a new file. */
	onChange(listener: () => void): () => void {
		return this.watcher.watch(() => this.settings.get().workCalendarFile, listener);
	}

	async eventsBetween(): Promise<EventBatch> {
		const { workCalendarFile, workCalendarTitles } = this.settings.get();
		const file = await this.file(workCalendarFile);
		const wanted = workCalendarTitles.map((t) => t.trim().toLowerCase()).filter((t) => t !== "");
		const events = (file.events ?? [])
			.filter((e) => wanted.length === 0 || wanted.includes(e.calendar.toLowerCase()))
			.map((e) => this.toEvent(e));
		return { events, updatedAt: new Date(file.exportedAt), detail: file.device };
	}

	/** Read and parsed again only when the file's time or size changed. */
	private async file(path: string): Promise<WorkCalendarFile> {
		const stat = await this.adapter.stat(path);
		if (!stat) throw new Error("file missing");
		const kept = this.kept;
		if (kept && kept.path === path && kept.mtime === stat.mtime && kept.size === stat.size) return kept.file;
		const file = JSON.parse(await this.adapter.read(path)) as WorkCalendarFile;
		this.kept = { path, mtime: stat.mtime, size: stat.size, file };
		return file;
	}

	private toEvent(e: WorkEventDto): CalendarEvent {
		return {
			id: e.id,
			title: e.title,
			start: new Date(e.start),
			end: new Date(e.end),
			allDay: e.allDay,
			calendar: e.calendar,
			color: e.color ?? DEFAULT_COLOR,
			source: "work",
		};
	}
}
