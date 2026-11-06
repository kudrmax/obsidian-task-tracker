import { oneLine } from "../domain/TaskTitle";
import { tasksFilePath } from "./documentText";
import { IPHONE_CALENDAR_FILE, type PhoneExport, phoneCalendarText } from "./calendarFile";
import type { CalendarSource } from "./contracts";
import type { GroupedList } from "../domain/Lists";
import { callDoorJson, type DoorAnswer, type DoorContext, doorMethods, settingsOf, type WireMeeting, type WireReminder } from "./PhoneCalls";
import { CALENDAR_SOURCES } from "./calendarFile";

export type { WireMeeting, WireReminder } from "./PhoneCalls";

/** What an action did: the file's new text, or that the task it names is no longer there. */
export type PhoneAction = { readonly changed: true; readonly text: string } | { readonly changed: false; readonly reason: "stale" };

/** The lists the phone writes a new task into. */
export type CaptureList = GroupedList;

const STALE: PhoneAction = { changed: false, reason: "stale" };

/** A method of `call` as the functions the app called before it answer: the result, or the error thrown. */
function answerOf(method: string, args: readonly unknown[], context: DoorContext): Extract<DoorAnswer, { ok: true }> | Extract<DoorAnswer, { ok: false }> {
	return JSON.parse(callDoorJson(method, JSON.stringify(args), JSON.stringify(context))) as DoorAnswer;
}

function resultOf<R>(method: string, args: readonly unknown[], context: DoorContext): R {
	const answer = answerOf(method, args, context);
	if (!answer.ok) throw new Error(answer.error.message);
	return answer.result as R;
}

/** An action as the app took it before `call`: the new text, or stale for a task gone and a blank title. */
function actionOf(method: string, args: readonly unknown[], context: DoorContext & { readonly tasks: string }): PhoneAction {
	const answer = answerOf(method, args, context);
	if (answer.ok) return { changed: true, text: answer.tasks ?? context.tasks };
	if (answer.error.code === "staleTask" || answer.error.code === "blank") return STALE;
	throw new Error(answer.error.message);
}

/**
 * The iOS app's door, `globalThis.TaskCalendarPhone`, called through JavaScriptCore: plain strings and numbers in and out,
 * times in epoch milliseconds, no state between calls. `call` answers every method by name; the functions before it
 * (`reminders` … `meetings`) are kept for the app as it is, each a wrapper over its method of `call`.
 */
export const phoneDoor = {
	/** `reminders.list`. */
	reminders(text: string, settingsJson: string, nowMs: number): WireReminder[] {
		return resultOf("reminders.list", [], { tasks: text, settings: settingsJson, nowMs });
	},

	/** `reminders.complete`. */
	complete(text: string, settingsJson: string, id: string, nowMs: number): PhoneAction {
		return actionOf("reminders.complete", [id], { tasks: text, settings: settingsJson, nowMs });
	},

	/** `reminders.silence`: the task stays on its time; it no longer reminds. */
	silence(text: string, settingsJson: string, id: string, nowMs: number): PhoneAction {
		return actionOf("reminders.silence", [id], { tasks: text, settings: settingsJson, nowMs });
	},

	/** `reminders.snooze`. */
	snooze(text: string, settingsJson: string, id: string, minutes: number, nowMs: number): PhoneAction {
		return actionOf("reminders.snooze", [id, minutes], { tasks: text, settings: settingsJson, nowMs });
	},

	/** `capture.add`; a blank title answers stale here. */
	capture(text: string, settingsJson: string, list: CaptureList, title: string, nowMs: number): PhoneAction {
		return actionOf("capture.add", [list, title], { tasks: text, settings: settingsJson, nowMs });
	},

	/** `calendars.files`: the calendars' files in the vault, in the order `meetings` takes their texts. */
	calendarFiles(settingsJson: string): string[] {
		return resultOf("calendars.files", [], { tasks: null, settings: settingsJson, nowMs: 0 });
	},

	/** `calendars.meetings`, the files' texts in `calendarFiles`' order; a file missing (`null`) or unreadable adds none. */
	meetings(settingsJson: string, texts: readonly (string | null)[], fromMs: number, toMs: number, nowMs: number): WireMeeting[] {
		const calendars = Object.fromEntries(CALENDAR_SOURCES.map((source, i) => [source, texts[i] ?? null])) as Record<CalendarSource, string | null>;
		return resultOf("calendars.meetings", [fromMs, toMs], { tasks: null, settings: settingsJson, nowMs, calendars });
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
