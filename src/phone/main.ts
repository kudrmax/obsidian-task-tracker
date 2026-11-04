import { type PhoneAction, type PhoneReminder, PhoneReminders } from "./PhoneReminders";

/** What the iOS app calls through JavaScriptCore: plain strings and numbers in and out, times in epoch milliseconds. */
interface WireReminder extends Omit<PhoneReminder, "start" | "dayEnd"> {
	readonly startMs: number;
	readonly dayEndMs: number;
}

function wire(r: PhoneReminder): WireReminder {
	const { start, dayEnd, ...rest } = r;
	return { ...rest, startMs: start.getTime(), dayEndMs: dayEnd.getTime() };
}

(globalThis as Record<string, unknown>).TaskCalendarPhone = {
	reminders: (text: string, settingsJson: string, nowMs: number): WireReminder[] => new PhoneReminders(settingsJson).reminders(text, new Date(nowMs)).map(wire),
	complete: (text: string, settingsJson: string, id: string, nowMs: number): PhoneAction => new PhoneReminders(settingsJson).complete(text, id, new Date(nowMs)),
	silence: (text: string, settingsJson: string, id: string, nowMs: number): PhoneAction => new PhoneReminders(settingsJson).silence(text, id, new Date(nowMs)),
	snooze: (text: string, settingsJson: string, id: string, minutes: number, nowMs: number): PhoneAction =>
		new PhoneReminders(settingsJson).snooze(text, id, minutes, new Date(nowMs)),
};
