import { type PhoneMeeting, PhoneMeetingService } from "../application/PhoneMeetingService";
import { type PhoneAction, type PhoneReminder, PhoneReminderService } from "../application/PhoneReminderService";

/** What the iOS app calls through JavaScriptCore: plain strings and numbers in and out, times in epoch milliseconds. */
interface WireReminder extends Omit<PhoneReminder, "start" | "dayEnd"> {
	readonly startMs: number;
	readonly dayEndMs: number;
}

interface WireMeeting {
	readonly title: string;
	readonly startMs: number;
	readonly endMs: number;
}

function wire(r: PhoneReminder): WireReminder {
	const { start, dayEnd, ...rest } = r;
	return { ...rest, startMs: start.getTime(), dayEndMs: dayEnd.getTime() };
}

function wireMeeting(m: PhoneMeeting): WireMeeting {
	return { title: m.title, startMs: m.start.getTime(), endMs: m.end.getTime() };
}

(globalThis as Record<string, unknown>).TaskCalendarPhone = {
	reminders: (text: string, settingsJson: string, nowMs: number): WireReminder[] => new PhoneReminderService(settingsJson).reminders(text, new Date(nowMs)).map(wire),
	complete: (text: string, settingsJson: string, id: string, nowMs: number): PhoneAction => new PhoneReminderService(settingsJson).complete(text, id, new Date(nowMs)),
	silence: (text: string, settingsJson: string, id: string, nowMs: number): PhoneAction => new PhoneReminderService(settingsJson).silence(text, id, new Date(nowMs)),
	snooze: (text: string, settingsJson: string, id: string, minutes: number, nowMs: number): PhoneAction =>
		new PhoneReminderService(settingsJson).snooze(text, id, minutes, new Date(nowMs)),
	calendarFiles: (settingsJson: string): string[] => new PhoneMeetingService(settingsJson).files(),
	meetings: (settingsJson: string, texts: (string | null)[], fromMs: number, toMs: number): WireMeeting[] =>
		new PhoneMeetingService(settingsJson).between(texts, new Date(fromMs), new Date(toMs)).map(wireMeeting),
};
