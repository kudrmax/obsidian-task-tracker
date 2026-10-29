import type { CalendarEvent } from "../application/contracts";
import type { EventBatch, EventSource } from "../application/EventSource";
import type { SettingsStore } from "../application/ports";

export interface WorkCalendarAdapter {
	exists(path: string): Promise<boolean>;
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

	constructor(
		private readonly adapter: WorkCalendarAdapter,
		private readonly settings: SettingsStore,
	) {}

	async eventsBetween(): Promise<EventBatch> {
		const { workCalendarFile, workCalendarTitles } = this.settings.get();
		if (!(await this.adapter.exists(workCalendarFile))) throw new Error("file missing");
		const file = JSON.parse(await this.adapter.read(workCalendarFile)) as WorkCalendarFile;
		const wanted = workCalendarTitles.map((t) => t.trim().toLowerCase()).filter((t) => t !== "");
		const events = (file.events ?? [])
			.filter((e) => wanted.length === 0 || wanted.includes(e.calendar.toLowerCase()))
			.map((e) => this.toEvent(e));
		return { events, updatedAt: new Date(file.exportedAt), detail: file.device };
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
