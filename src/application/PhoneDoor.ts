import type { GroupedList } from "../domain/Lists";
import { settingsFrom, type TaskCalendarSettings } from "../settings";
import { CALENDAR_SOURCES, type CalendarFile, calendarPath, readCalendarFile } from "./calendarFile";
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

const STALE: PhoneAction = { changed: false, reason: "stale" };

function action(text: string | null): PhoneAction {
	return text === null ? STALE : { changed: true, text };
}

/** The plugin's settings from its `data.json`, or the defaults for nothing. */
function settingsOf(json: string): TaskCalendarSettings {
	return settingsFrom(json.trim() === "" ? null : JSON.parse(json));
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
		return new Call(settingsJson, nowMs).reminders.ringing(text).map(({ key, start, dayEnd, ...rest }) => ({
			id: key.raw,
			...rest,
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
};
