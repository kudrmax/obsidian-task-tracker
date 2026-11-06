import type { GroupedList } from "../domain/Lists";
import { MINUTES_PER_DAY, minutesToHHMM } from "../domain/LocalDate";
import type { TaskCalendarSettings } from "../settings";
import { tasksFilePath } from "./documentText";
import { CALENDAR_SOURCES, type CalendarFile, calendarPath, IPHONE_CALENDAR_FILE, type PhoneExport, phoneCalendarText, readCalendarFile } from "./calendarFile";
import { callDoorJson, doorMethods, settingsOf } from "./PhoneCalls";
import { oneLine } from "../domain/TaskTitle";
import type { CalendarSource } from "./contracts";
import type { Clock, SettingsStore } from "./ports";
import { ShownCalendars } from "./shownCalendars";
import { TaskReminders } from "./TaskReminders";
import { TaskRules } from "./TaskRules";

/** A reminder on the wire: the task's line as its id, times in epoch milliseconds. */
export interface WireReminder {
	/** The task's line as read: an action finds the task by it. */
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly kind: "notification" | "alarm" | "live";
	/** The slot's date, `YYYY-MM-DD`. */
	readonly date: string;
	readonly startMs: number;
	readonly dayEndMs: number;
}

export interface WireMeeting {
	readonly title: string;
	readonly startMs: number;
	readonly endMs: number;
}

/** What an action did: the file's new text, or that the task it names is no longer there. */
export type PhoneAction = { readonly changed: true; readonly text: string } | { readonly changed: false; readonly reason: "stale" };

/** The lists the phone writes a new task into. */
export type CaptureList = GroupedList;

/** The reminder's time as the app shows it: `10:00`, or `10:00–11:00`. */
function timeText(start: number, end: number | null): string {
	return end === null ? minutesToHHMM(start) : `${minutesToHHMM(start)}–${minutesToHHMM(end % MINUTES_PER_DAY)}`;
}

const STALE: PhoneAction = { changed: false, reason: "stale" };

function action(text: string | null): PhoneAction {
	return text === null ? STALE : { changed: true, text };
}

/** The settings as they are for one call: the phone only reads them. */
function fixedSettings(settings: TaskCalendarSettings): SettingsStore {
	return { get: () => settings, update: async () => undefined, onChange: () => () => undefined };
}

/** One call's view of the tasks file: the plugin's rules under the settings given, at the moment given. */
class Call {
	readonly rules: TaskRules;
	readonly reminders: TaskReminders;

	constructor(settingsJson: string, nowMs: number) {
		const clock: Clock = { now: () => new Date(nowMs) };
		this.rules = new TaskRules(fixedSettings(settingsOf(settingsJson)), clock);
		this.reminders = new TaskReminders(this.rules, clock);
	}
}

/**
 * The iOS app's door, `globalThis.TaskCalendarPhone`, called through JavaScriptCore: plain strings and numbers in and out,
 * times in epoch milliseconds, no state between calls. Each call reads the text it is given with the same rules the
 * plugin's services read and write the vault's file with, and gives the new text back for the app to write.
 */
export const phoneDoor = {
	reminders(text: string, settingsJson: string, nowMs: number): WireReminder[] {
		return new Call(settingsJson, nowMs).reminders.ringing(text).map(({ key, startMinute, endMinute, start, dayEnd, title, kind, date }) => ({
			id: key.raw,
			title,
			body: timeText(startMinute, endMinute),
			kind,
			date,
			startMs: start.getTime(),
			dayEndMs: dayEnd.getTime(),
		}));
	},

	complete(text: string, settingsJson: string, id: string, nowMs: number): PhoneAction {
		const { rules, reminders } = new Call(settingsJson, nowMs);
		return action(reminders.act(text, id, (key) => rules.setStatus(key, "done")));
	},

	/** The task stays on its time; it no longer reminds. */
	silence(text: string, settingsJson: string, id: string, nowMs: number): PhoneAction {
		const { rules, reminders } = new Call(settingsJson, nowMs);
		return action(reminders.act(text, id, (key) => rules.setReminder(key, "none")));
	},

	snooze(text: string, settingsJson: string, id: string, minutes: number, nowMs: number): PhoneAction {
		const { rules, reminders } = new Call(settingsJson, nowMs);
		return action(reminders.act(text, id, (key) => rules.snooze(key, minutes)));
	},

	/**
	 * A task typed or spoken on the phone, last in `list` as the plugin's quick entry puts it. Only an empty title writes
	 * nothing: one of only a priority is written, unlike the plugin's `createInPlace`, as the phone always did.
	 */
	capture(text: string, settingsJson: string, list: CaptureList, title: string, nowMs: number): PhoneAction {
		if (title.trim() === "") return STALE;
		const { rules } = new Call(settingsJson, nowMs);
		return action(rules.change(text, rules.placeNew(title, null, { kind: "list", list, group: null, before: null })).text);
	},

	/** The calendars' files in the vault, in the order `meetings` takes their texts. */
	calendarFiles(settingsJson: string): string[] {
		const settings = settingsOf(settingsJson);
		return CALENDAR_SOURCES.map((source) => calendarPath(source, settings));
	},

	/** The timed meetings that overlap `from`–`to`, as the calendar on screen shows them; a file missing (`null`) or unreadable adds none. */
	meetings(settingsJson: string, texts: readonly (string | null)[], fromMs: number, toMs: number, nowMs: number): WireMeeting[] {
		const files = new Map<CalendarSource, CalendarFile>();
		CALENDAR_SOURCES.forEach((source, i) => {
			const text = texts[i];
			if (text === null || text === undefined) return;
			try {
				files.set(source, readCalendarFile(text, source));
			} catch {
				// A broken file is no file.
			}
		});
		return new ShownCalendars(files, settingsOf(settingsJson), new Date(nowMs))
			.days()
			.timedBetween(new Date(fromMs), new Date(toMs))
			.map((e) => ({ title: e.title, startMs: e.start.getTime(), endMs: e.end.getTime() }));
	},

	/**
	 * Every call of the services a frontend makes, by name (`tasks.screen`, `entry.enter`, …: see `docs/door.md`): the
	 * arguments a JSON list, the context the files' texts, the settings and the moment; the answer JSON, the result with the
	 * texts to write back, or the error by its code.
	 */
	call(method: string, argsJson: string, contextJson: string): string {
		return callDoorJson(method, argsJson, contextJson);
	},

	/** Every method `call` answers, `space.name`. */
	methods(): string[] {
		return doorMethods();
	},

	/** The tasks file a host reads, by path from the vault folder, as the plugin reads it: none for a blank setting. */
	tasksFile(settingsJson: string): string | null {
		return tasksFilePath(settingsOf(settingsJson));
	},

	/** Where the iOS app writes the phone's calendars, by path from the vault folder. */
	iphoneCalendarFile(): string {
		return IPHONE_CALENDAR_FILE;
	},

	/** `iphoneCalendarFile`'s text for the phone's calendars and events (`PhoneExport`, as JSON), in the format every writer of the calendars uses. */
	iphoneCalendarText(exportJson: string): string {
		return phoneCalendarText(JSON.parse(exportJson) as PhoneExport);
	},

	/** A task is one line: a line break in its title reads as one space, as the plugin writes it. */
	oneLine(text: string): string {
		return oneLine(text);
	},
};
