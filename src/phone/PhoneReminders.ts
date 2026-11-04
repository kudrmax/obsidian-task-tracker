import { applyOperation, applyOperationAsRead, boundaryOf, readDocument } from "../application/documentText";
import type { DayBoundary } from "../domain/DayBoundary";
import { addDays, localDateOf, minutesToHHMM } from "../domain/LocalDate";
import * as ops from "../domain/operations";
import { openSlotted } from "../domain/queries";
import type { LocalDate, Slot } from "../domain/Task";
import type { TaskDocument, TaskEntry } from "../domain/TaskDocument";
import { plainText } from "../domain/TaskText";
import { settingsFrom, type TaskCalendarSettings } from "../settings";

const DAY_MINUTES = 1440;
const HOUR_MINUTES = 60;

/** A task on a time, as the phone reminds of it: from its start until its day ends. */
export interface PhoneReminder {
	/** The task's line as read: an action finds the task by it. */
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly kind: "notification" | "alarm";
	/** The slot's date, `YYYY-MM-DD`. */
	readonly date: LocalDate;
	readonly start: Date;
	readonly dayEnd: Date;
}

export type PhoneAction = { readonly changed: true; readonly text: string } | { readonly changed: false; readonly reason: "stale" };

function clockOf(date: LocalDate, minutes: number): Date {
	const [year, month, day] = date.split("-").map(Number);
	return new Date(year, month - 1, day, 0, minutes);
}

class StaleTask extends Error {}

/** What the phone app asks of the tasks file, read with the plugin's settings (its `data.json`, or nothing for the defaults). */
export class PhoneReminders {
	private readonly settings: TaskCalendarSettings;
	private readonly boundary: DayBoundary;

	constructor(settingsJson: string) {
		this.settings = settingsFrom(settingsJson.trim() === "" ? null : JSON.parse(settingsJson));
		this.boundary = boundaryOf(this.settings);
	}

	reminders(text: string, now: Date): PhoneReminder[] {
		const doc = readDocument(text, this.settings, this.boundary.dayOf(now), this.boundary);
		return openSlotted(doc)
			.filter((e) => e.task.reminder !== "none")
			.map((e) => this.reminder(e, e.task.slot!))
			.filter((r) => r.dayEnd > now)
			.sort((a, b) => a.start.getTime() - b.start.getTime());
	}

	complete(text: string, id: string, now: Date): PhoneAction {
		return this.act(text, id, now, (doc, entry) => ops.setStatus(doc, entry, "done"));
	}

	/** The task stays on its time; it no longer reminds. */
	silence(text: string, id: string, now: Date): PhoneAction {
		return this.act(text, id, now, (doc, entry) => ops.setReminder(doc, entry, "none"));
	}

	snooze(text: string, id: string, minutes: number, now: Date): PhoneAction {
		return this.act(text, id, now, (doc, entry, today, boundary) => ops.setSlot(doc, entry, this.from(now, minutes, entry.task.slot!), today, boundary));
	}

	private act(text: string, id: string, now: Date, op: (doc: TaskDocument, entry: TaskEntry, today: LocalDate, boundary: DayBoundary) => TaskDocument): PhoneAction {
		const onTask = (doc: TaskDocument, today: LocalDate, boundary: DayBoundary): TaskDocument => {
			const entry = openSlotted(doc).find((e) => e.raw === id);
			if (!entry) throw new StaleTask();
			return op(doc, entry, today, boundary);
		};
		// A reminder still shown after its day ended names a slot that today's normalizing has already erased.
		for (const apply of [applyOperation, applyOperationAsRead]) {
			try {
				return { changed: true, text: apply(text, this.settings, now, onTask) };
			} catch (e) {
				if (!(e instanceof StaleTask)) throw e;
			}
		}
		return { changed: false, reason: "stale" };
	}

	/** `slot` moved to start `minutes` from now, as long as it was. */
	private from(now: Date, minutes: number, slot: Slot): Slot {
		const at = new Date(now.getTime() + minutes * 60_000);
		const start = at.getHours() * HOUR_MINUTES + at.getMinutes();
		return { date: localDateOf(at), start, end: slot.end === null ? null : start + (slot.end - slot.start) };
	}

	private reminder(entry: TaskEntry, slot: Slot): PhoneReminder {
		const start = minutesToHHMM(slot.start);
		const nextDay = addDays(this.boundary.dayOfSlot(slot), 1);
		return {
			id: entry.raw,
			title: plainText(entry.task.text),
			body: slot.end === null ? start : `${start}–${minutesToHHMM(slot.end % DAY_MINUTES)}`,
			kind: entry.task.reminder === "alarm" ? "alarm" : "notification",
			date: slot.date,
			start: clockOf(slot.date, slot.start),
			dayEnd: clockOf(nextDay, this.boundary.startHour * HOUR_MINUTES),
		};
	}
}
