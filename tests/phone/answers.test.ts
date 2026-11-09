import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * What the iOS app gets back from each of `TaskCalendarPhone`'s functions over a corpus of files, settings and moments.
 * The snapshot was taken from the bundle before the phone went through the plugin's services: a change in it is a change
 * the iOS app sees.
 */

type Fn = (...args: unknown[]) => unknown;
const sandbox: { TaskCalendarPhone?: Record<string, Fn> } = {};
runInNewContext(readFileSync("core/task-calendar-phone.js", "utf8"), sandbox);
const phone = sandbox.TaskCalendarPhone!;

const pad = (n: number) => String(n).padStart(2, "0");
const local = (ms: number) => {
	const d = new Date(ms);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Times as local clock readings: the snapshot reads the same in any time zone. */
function readable(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(readable);
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k.endsWith("Ms") && typeof v === "number" ? local(v) : readable(v)]));
	}
	return value;
}

function call(name: string, ...args: unknown[]): unknown {
	try {
		return readable(phone[name](...args));
	} catch (e) {
		return { threw: String(e) };
	}
}

const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();

const PLAIN = [
	"## Inbox",
	"",
	"- [ ] Old",
	"- [ ] p2 Ring later ⏰ 2026-11-04 18:00",
	"",
	"## Now",
	"",
	"- [ ] p1 Call [[Mom]] ⏰ 2026-11-04 10:00-11:00",
	"- [ ] Wake 🚨 2026-11-04 12:00",
	"- [ ] Wake 🚨 2026-11-04 12:00",
	"- [ ] Quiet 🔕 2026-11-04 13:00",
	"- [ ] Pinned 📌 2026-11-04 13:30",
	"- [ ] Gym 🚨 2026-11-04 07:00 🔁 every day",
	"- [ ] Parent 📅 2026-11-04",
	"\t- [ ] Child ⏰ 2026-11-04 15:00",
	"\t\tA note under the child",
	"- [ ] Late night ⏰ 2026-11-04 23:30-00:30",
	"- [ ] After midnight 🚨 2026-11-05 01:00",
	"- [ ] Yesterday's ⏰ 2026-11-03 21:00",
	"- [x] Closed ⏰ 2026-11-04 14:00",
	"### Errands",
	"- [ ] Shop ⏰ 2026-11-04 16:00 #label/Fast",
	"",
	"## Soon",
	"",
	"- [ ] Later",
	"- [ ] Dated 📅 2026-11-07",
	"- [ ] Tomorrow's slot ⏰ 2026-11-05 09:00",
	"",
	"## Backlog",
	"",
	"- [ ] Someday",
	"",
	"## Done",
	"",
	"- [x] Long ago",
	"",
].join("\n");

const RUSSIAN = [
	"## Сейчас",
	"",
	"- [ ] Разобрать задачи #label/Быстрее 📅 2026-11-04",
	"- [ ] Позвонить ⏰ 2026-11-04 10:00",
	"### В аэропорту",
	"- [ ] Рассчитаться 🚨 2026-11-04 11:00",
	"",
	"## Скоро",
	"",
	"- [ ] Скинуть деньги",
	"- [ ] Ночная встреча ⏰ 2026-11-05 02:00",
	"",
	"## Когда-нибудь",
	"",
	"## Готово",
	"",
	"## Входящие",
	"",
	"- [ ] Купить хлеб",
	"",
].join("\n");

const SETTINGS: Readonly<Record<string, string>> = {
	defaults: "",
	blankJson: "  ",
	russian: JSON.stringify({ sections: { inbox: "Входящие", now: "Сейчас", soon: "Скоро", backlog: "Когда-нибудь", done: "Готово" }, labels: [{ name: "Быстрее", color: "blue" }] }),
	early: JSON.stringify({ dayStartHour: 0 }),
	late: JSON.stringify({ dayStartHour: 4, priorities: [{ prefix: "!!", color: "red" }], labels: [{ name: "Fast", color: "green" }] }),
	marks: JSON.stringify({ sections: { now: "Today" }, alarmSlotMarker: "ring:", slotMarker: "at:" }),
};

const TEXTS: Readonly<Record<string, string>> = {
	plain: PLAIN,
	russian: RUSSIAN,
	marks: "## Today\n\n- [ ] A ring: 2026-11-04 10:00\n- [ ] B at: 2026-11-04 11:00-12:00\n",
	empty: "",
	headingOnly: "## Now\n",
};

const MOMENTS: Readonly<Record<string, number>> = {
	morning: at(4, 9),
	evening: at(4, 23, 50),
	beforeDayStart: at(5, 3),
	nextMorning: at(5, 7, 30),
};

/** Every reminder of every file, settings and moment, and each action on it then. */
function reminderCases(): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [t, text] of Object.entries(TEXTS)) {
		for (const [s, settings] of Object.entries(SETTINGS)) {
			for (const [m, now] of Object.entries(MOMENTS)) {
				const key = `${t} · ${s} · ${m}`;
				const found = phone.reminders(text, settings, now) as { id: string }[];
				out[`reminders · ${key}`] = readable(found);
				for (const { id } of found) {
					for (const [later, when] of Object.entries(MOMENTS).filter(([, ms]) => ms >= now)) {
						const act = `${key} · ${id} · at ${later}`;
						out[`complete · ${act}`] = call("complete", text, settings, id, when);
						out[`silence · ${act}`] = call("silence", text, settings, id, when);
						out[`snooze 15 · ${act}`] = call("snooze", text, settings, id, 15, when);
						out[`snooze 90 · ${act}`] = call("snooze", text, settings, id, 90, when);
					}
				}
			}
		}
	}
	return out;
}

/** Ids no reminder has now: a changed line, a closed task, a task with no time, no line at all. */
function staleCases(): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	const ids = ["- [ ] Wake 🚨 2026-11-04 09:00", "- [x] Closed ⏰ 2026-11-04 14:00", "- [ ] Quiet 🔕 2026-11-04 13:00", "- [ ] Old", "", "nothing"];
	for (const id of ids) {
		for (const [m, now] of Object.entries(MOMENTS)) {
			out[`complete · ${id} · ${m}`] = call("complete", PLAIN, "", id, now);
			out[`silence · ${id} · ${m}`] = call("silence", PLAIN, "", id, now);
			out[`snooze · ${id} · ${m}`] = call("snooze", PLAIN, "", id, 30, now);
		}
	}
	return out;
}

function captureCases(): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	const titles = ["Buy milk", "", "   ", "p1", "p1 ", "p1 Call the bank", "!! Urgent", "Купить\r\nмолоко и хлеб", "[[Recording 20261106143200.m4a]] #transcribe", "Tag #label/Fast", "  padded  "];
	for (const [t, text] of Object.entries(TEXTS)) {
		for (const [s, settings] of Object.entries(SETTINGS)) {
			for (const list of ["inbox", "now", "soon", "backlog"]) {
				for (const title of titles) out[`capture · ${t} · ${s} · ${list} · ${JSON.stringify(title)}`] = call("capture", text, settings, list, title, MOMENTS.morning);
			}
		}
		out[`capture · ${t} · defaults · now · before the day starts`] = call("capture", text, "", "now", "Night owl", MOMENTS.beforeDayStart);
	}
	return out;
}

function calendarCases(): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [s, settings] of Object.entries({ ...SETTINGS, work: JSON.stringify({ workCalendarFile: "cal/work.json" }) })) out[`calendarFiles · ${s}`] = call("calendarFiles", settings);

	const iso = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).toISOString();
	const meeting = (title: string, day: number, start: number, end: number, calendar = "Work", allDay = false, extra: object = {}) => ({
		id: title,
		title,
		start: iso(day, start),
		end: iso(day, end),
		allDay,
		calendar,
		...extra,
	});
	const exportedAt = iso(4, 8);
	const google = JSON.stringify({
		exportedAt,
		calendars: [
			{ calendar: "max@gmail.com", account: "max@gmail.com", calendarId: "max@gmail.com" },
			{ calendar: "Personal", account: "max@gmail.com", calendarId: "p" },
		],
		events: [meeting("Lunch", 4, 13, 14, "Personal", false, { calendarId: "p", account: "max@gmail.com" }), meeting("Birthday", 4, 0, 24, "Personal", true, { calendarId: "p", account: "max@gmail.com" })],
	});
	const iphone = JSON.stringify({
		exportedAt,
		from: new Date(2026, 10, 4).toISOString(),
		to: new Date(2026, 10, 11).toISOString(),
		calendars: [{ calendar: "Personal", account: "Gmail", calendarId: "ek-p" }, { calendar: "Work" }],
		events: [meeting("Lunch, the phone's copy", 4, 13, 14, "Personal", false, { calendarId: "ek-p", account: "Gmail" }), meeting("Night release", 5, 1, 2)],
	});
	const work = JSON.stringify({
		exportedAt,
		from: new Date(2026, 10, 3).toISOString(),
		to: new Date(2026, 10, 10).toISOString(),
		calendars: [{ calendar: "Work" }, { calendar: "Dentist" }],
		events: [meeting("Standup", 4, 10, 11), meeting("Dentist", 4, 12, 13, "Dentist"), meeting("Late", 4, 20, 21), meeting("Very late", 4, 23, 24), meeting("Night release, Scriptable's", 5, 1, 3)],
	});
	const files: Readonly<Record<string, (string | null)[]>> = {
		none: [null, null, null],
		work: [null, null, work],
		broken: ["{", null, work],
		all: [google, iphone, work],
		phoneAndGoogle: [google, iphone, null],
	};
	const calendarSettings: Readonly<Record<string, string>> = {
		defaults: "",
		migrated: JSON.stringify({ calendarsMigrated: true }),
		hidden: JSON.stringify({ calendarsMigrated: true, hiddenCalendars: [{ account: "max@gmail.com", title: "Personal" }] }),
		workTitles: JSON.stringify({ workCalendarTitles: ["work"] }),
		midnight: JSON.stringify({ dayStartHour: 0, calendarsMigrated: true }),
		stale: JSON.stringify({ staleAfterMinutes: 1 }),
	};
	const spans: Readonly<Record<string, [number, number, number]>> = {
		workday: [at(4, 9), at(4, 18), at(4, 9)],
		wholeDay: [at(4, 0), at(5, 0), at(4, 9)],
		night: [at(5, 0, 30), at(5, 4, 30), at(5, 0, 30)],
		twoDays: [at(4, 0), at(6, 0), at(5, 0, 30)],
		later: [at(4, 9), at(4, 18), at(6, 9)],
	};
	for (const [f, texts] of Object.entries(files)) {
		for (const [s, settings] of Object.entries(calendarSettings)) {
			for (const [span, [from, to, now]] of Object.entries(spans)) out[`meetings · ${f} · ${s} · ${span}`] = call("meetings", settings, texts, from, to, now);
		}
	}
	return out;
}

/** The corpus runs the whole bundle thousands of times: seconds of work, more on a busy machine than vitest's 5 s. */
const CORPUS_MS = 60_000;

describe("TaskCalendarPhone's answers", { timeout: CORPUS_MS }, () => {
	it("to reminders and their actions stay as they were", () => {
		expect(reminderCases()).toMatchSnapshot();
	});

	it("to actions on a task that is no longer there stay as they were", () => {
		expect(staleCases()).toMatchSnapshot();
	});

	it("to capture stay as they were, a title of only a priority included", () => {
		expect(captureCases()).toMatchSnapshot();
	});

	it("to calendarFiles and meetings stay as they were", () => {
		expect(calendarCases()).toMatchSnapshot();
	});
});
