import { addDays } from "../domain/LocalDate";
import { openSlotted } from "../domain/queries";
import type { LocalDate, Slot } from "../domain/Task";
import type { TaskDocument, TaskEntry } from "../domain/TaskDocument";
import { plainText } from "../domain/TaskText";
import type { TaskKey } from "./contracts";
import { keyOf } from "./taskKeys";
import type { Clock } from "./ports";
import type { Moment, Operation, TaskRules } from "./TaskRules";

const HOUR_MINUTES = 60;

/** A task on a time, as the phone reminds of it: from its start until its day ends. */
export interface TaskReminder {
	readonly key: TaskKey;
	readonly title: string;
	/** Its slot's start and end, minutes from the slot's midnight; null for a slot without an end. */
	readonly startMinute: number;
	readonly endMinute: number | null;
	readonly kind: "notification" | "alarm" | "live";
	/** The slot's date, `YYYY-MM-DD`. */
	readonly date: LocalDate;
	readonly start: Date;
	readonly dayEnd: Date;
}

function clockOf(date: LocalDate, minutes: number): Date {
	const [year, month, day] = date.split("-").map(Number);
	return new Date(year, month - 1, day, 0, minutes);
}



/** Which tasks ring and when, and the action on one the phone still shows: over the same rules the plugin writes with. */
export class TaskReminders {
	constructor(
		private readonly rules: TaskRules,
		private readonly clock: Clock,
	) {}

	/** The open tasks on a time that remind, until their day ends, by start. */
	ringing(text: string): TaskReminder[] {
		const at = this.rules.moment();
		const now = this.clock.now();
		return openSlotted(this.rules.read(text, at).doc)
			.filter((e) => e.task.reminder !== "none")
			.map((e) => this.reminder(e, e.task.slot!, at))
			.filter((r) => r.dayEnd > now)
			.sort((a, b) => a.start.getTime() - b.start.getTime());
	}

	/**
	 * The text after `action` on the reminding task whose line is `line`, the first of two alike; null when no such task is
	 * left. A reminder still shown after its day ended names a slot that today's normalizing has already erased: it is
	 * found in the file as it is.
	 */
	act(text: string, line: string, action: (key: TaskKey) => Operation): string | null {
		const at = this.rules.moment();
		const { doc } = this.rules.read(text, at);
		const found = this.find(doc, line);
		if (found) return this.rules.changeOf(doc, action(found), at).text;
		const asRead = this.find(this.rules.asRead(text, at), line);
		return asRead ? this.rules.changeAsRead(text, action(asRead), at).text : null;
	}

	private find(doc: TaskDocument, line: string): TaskKey | null {
		const entry = openSlotted(doc).find((e) => e.raw === line);
		return entry ? keyOf(entry) : null;
	}

	private reminder(entry: TaskEntry, slot: Slot, at: Moment): TaskReminder {
		const nextDay = addDays(at.boundary.dayOfSlot(slot), 1);
		return {
			key: keyOf(entry),
			title: plainText(entry.task.text),
			startMinute: slot.start,
			endMinute: slot.end,
			kind: entry.task.reminder === "none" ? "notification" : entry.task.reminder,
			date: slot.date,
			start: clockOf(slot.date, slot.start),
			dayEnd: clockOf(nextDay, at.boundary.startHour * HOUR_MINUTES),
		};
	}
}
