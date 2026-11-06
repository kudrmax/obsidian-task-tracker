import { describe, expect, it } from "vitest";
import { callDoor, type DoorAnswer, type DoorContext, plainJson } from "../../src/application/PhoneCalls";
import { phoneDoor } from "../../src/application/PhoneDoor";

/** The phone's own calls through `call`: reminders, capture, the calendars' files and meetings; the functions before `call` wrap them. */

const NOW = new Date(2026, 10, 4, 9, 30).getTime();
const LUNCH = "- [ ] Lunch ⏰ 2026-11-04 13:00-14:00";
const FILE = ["## Inbox", "", "- [ ] Idea", "", "## Now", "", LUNCH, "- [ ] Call 🚨 2026-11-04 15:00", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");

const context = (extra: Partial<DoorContext> = {}): DoorContext => ({ tasks: FILE, settings: "", nowMs: NOW, ...extra });
const ok = (answer: DoorAnswer) => {
	if (!answer.ok) throw new Error(`${answer.error.code}: ${answer.error.message}`);
	return answer;
};

const iso = (day: number, h: number) => new Date(2026, 10, day, h).toISOString();
const GOOGLE = JSON.stringify({
	exportedAt: iso(4, 8),
	calendars: [
		{ calendar: "Personal", account: "max@gmail.com", calendarId: "p" },
		{ calendar: "Other", account: "max@gmail.com", calendarId: "o" },
	],
	events: [
		{ id: "l", title: "Lunch", start: iso(4, 13), end: iso(4, 14), allDay: false, calendar: "Personal", calendarId: "p", account: "max@gmail.com" },
		{ id: "x", title: "Hidden", start: iso(4, 15), end: iso(4, 16), allDay: false, calendar: "Other", calendarId: "o", account: "max@gmail.com" },
	],
});
const IPHONE = JSON.stringify({ exportedAt: iso(4, 8), calendars: [], events: [] });
/** Before the calendars were chosen one by one: Google's calendar "Other" left unchecked. */
const OLD_CHOICE = JSON.stringify({ google: { calendarIds: ["p"] } });

describe("reminders.*", () => {
	it("list the reminders as `reminders` did", () => {
		expect(ok(callDoor("reminders.list", [], context())).result).toEqual(phoneDoor.reminders(FILE, "", NOW));
	});

	it("write an action as a step, and name a task gone by staleTask", () => {
		const done = ok(callDoor("reminders.complete", [LUNCH], context()));
		expect(done).toMatchObject({ result: null, step: true });
		expect(done.tasks).toContain("- [x] Lunch");
		expect(callDoor("reminders.snooze", ["- [ ] Gone ⏰ 2026-11-04 10:00", 15], context())).toMatchObject({ ok: false, error: { code: "staleTask" } });
	});

	it("need the tasks file", () => {
		expect(callDoor("reminders.list", [], context({ tasks: null }))).toMatchObject({ ok: false, error: { code: "tasksFileMissing" } });
	});
});

describe("capture.add", () => {
	it("answers blank for a blank title, and writes a title of only a priority", () => {
		expect(callDoor("capture.add", ["inbox", "  "], context())).toMatchObject({ ok: false, error: { code: "blank" } });
		expect(ok(callDoor("capture.add", ["inbox", "p1"], context())).tasks).toContain("- [ ] Idea\n- [ ] p1\n");
	});

	it("is what `capture` wrote", () => {
		const legacy = phoneDoor.capture(FILE, "", "now", "Buy milk", NOW);
		expect(legacy).toEqual({ changed: true, text: ok(callDoor("capture.add", ["now", "Buy milk"], context())).tasks });
	});
});

describe("calendars.files and calendars.meetings", () => {
	it("name the calendars' files as `calendarFiles` did", () => {
		expect(ok(callDoor("calendars.files", [], context({ settings: JSON.stringify({ workCalendarFile: "cal/w.json" }) }))).result).toEqual(phoneDoor.calendarFiles(JSON.stringify({ workCalendarFile: "cal/w.json" })));
	});

	it("carry the old choice of calendars over once, as calendars.events does, and meet the same meetings", () => {
		const from = new Date(2026, 10, 4, 0).getTime();
		const to = new Date(2026, 10, 5, 0).getTime();
		const answer = ok(callDoor("calendars.meetings", [from, to], context({ settings: OLD_CHOICE, calendars: { google: GOOGLE, iphone: IPHONE } })));
		expect(answer.result).toEqual([{ title: "Lunch", startMs: new Date(2026, 10, 4, 13).getTime(), endMs: new Date(2026, 10, 4, 14).getTime() }]);
		expect(JSON.parse(answer.settings!)).toMatchObject({ calendarsMigrated: true, hiddenCalendars: [{ account: "max@gmail.com", title: "Other" }] });
		const events = ok(callDoor("calendars.events", ["2026-11-04"], context({ settings: OLD_CHOICE, calendars: { google: GOOGLE, iphone: IPHONE } })));
		expect(answer.settings).toBe(events.settings);
		expect(phoneDoor.meetings(OLD_CHOICE, [GOOGLE, IPHONE, null], from, to, NOW)).toEqual(answer.result);
	});
});

describe("the functions before `call`", () => {
	it("answer plain JSON, strict", () => {
		const id = phoneDoor.reminders(FILE, "", NOW)[0].id;
		const answers = [
			phoneDoor.reminders(FILE, "", NOW),
			phoneDoor.complete(FILE, "", id, NOW),
			phoneDoor.silence(FILE, "", id, NOW),
			phoneDoor.snooze(FILE, "", id, 15, NOW),
			phoneDoor.complete(FILE, "", "nothing", NOW),
			phoneDoor.capture(FILE, "", "inbox", "A", NOW),
			phoneDoor.capture(FILE, "", "inbox", " ", NOW),
			phoneDoor.calendarFiles(""),
			phoneDoor.meetings(OLD_CHOICE, [GOOGLE, IPHONE, "{"], 0, NOW * 2, NOW),
		];
		for (const answer of answers) expect(() => plainJson(answer, true)).not.toThrow();
	});

	it("throw what the door could not answer", () => {
		expect(() => phoneDoor.reminders(FILE, "{", NOW)).toThrow();
	});
});
