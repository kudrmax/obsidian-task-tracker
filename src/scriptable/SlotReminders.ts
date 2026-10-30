import { minutesToHHMM } from "../domain/LocalDate";
import { openSlotted } from "../domain/queries";
import type { Slot } from "../domain/Task";
import { TaskDocument, type SectionNamesOf } from "../domain/TaskDocument";
import type { Markers } from "../domain/TaskLine";

const DAY_MINUTES = 1440;

export interface ReminderSettings {
	readonly sections: SectionNamesOf;
	readonly markers: Markers;
}

/** A notification due at a slot's start. */
export interface Reminder {
	/** The same task on the same time keeps its id between runs. */
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly at: Date;
}

/** Turns the tasks file into the reminders still ahead: one at the start of every unfinished task put on a time. */
export class SlotReminders {
	/** iOS keeps 64 pending notifications per app; the rest is left to Scriptable's other scripts. */
	static readonly LIMIT = 50;
	static readonly THREAD = "task-calendar";

	constructor(private readonly settings: ReminderSettings) {}

	of(text: string, now: Date): Reminder[] {
		return openSlotted(TaskDocument.parse(text, this.settings.sections, this.settings.markers))
			.map((e) => this.reminder(e.task.text, e.task.slot!))
			.filter((r) => r.at > now)
			.sort((a, b) => a.at.getTime() - b.at.getTime())
			.slice(0, SlotReminders.LIMIT);
	}

	private reminder(text: string, slot: Slot): Reminder {
		const start = minutesToHHMM(slot.start);
		const [year, month, day] = slot.date.split("-").map(Number);
		return {
			id: `${SlotReminders.THREAD} ${slot.date} ${start} ${text}`,
			title: text,
			body: slot.end === null ? start : `${start}–${minutesToHHMM(slot.end % DAY_MINUTES)}`,
			at: new Date(year, month - 1, day, 0, slot.start),
		};
	}
}
