import { describe, expect, it } from "vitest";
import type { CalendarFile, FileCalendar } from "../../src/application/calendarFile";
import { CalendarChoice, type CalendarKey, textOrder } from "../../src/application/calendarChoice";
import type { CalendarEvent, CalendarSource } from "../../src/application/contracts";

const NOW = new Date(2026, 10, 5, 12);
const STALE_AFTER = 3 * 60 * 60_000;
const DAY = { start: new Date(2026, 10, 5), end: new Date(2026, 10, 6) };
const GMAIL = "max@gmail.com";
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

interface Cal {
	readonly title: string;
	readonly account?: string | null;
	readonly calendarId?: string | null;
}

function meeting(source: CalendarSource, cal: Cal, title: string, hour: number, date = 5): CalendarEvent {
	return {
		id: `${source}:${title}`,
		title,
		start: new Date(2026, 10, date, hour),
		end: new Date(2026, 10, date, hour + 1),
		allDay: false,
		calendar: cal.title,
		color: "#000000",
		source,
		account: cal.account ?? null,
		calendarId: cal.calendarId ?? null,
	};
}

function file(exportedMinutesAgo: number, calendars: Cal[], events: CalendarEvent[], windowed = true): CalendarFile {
	return {
		events,
		calendars: calendars.map((c): FileCalendar => ({ title: c.title, account: c.account ?? null, calendarId: c.calendarId ?? null, color: null })),
		exportedAt: minutesAgo(exportedMinutesAgo),
		device: null,
		from: windowed ? new Date(2026, 9, 6) : null,
		to: windowed ? new Date(2027, 1, 4) : null,
		validUntil: null,
	};
}

const choice = (files: Partial<Record<CalendarSource, CalendarFile>>, hidden: CalendarKey[] = []) =>
	new CalendarChoice(new Map(Object.entries(files) as [CalendarSource, CalendarFile][]), hidden, STALE_AFTER, NOW);
const titles = (events: readonly CalendarEvent[]) => events.map((e) => e.title);

const PERSONAL_G: Cal = { title: "Personal", account: GMAIL, calendarId: "personal" };
const MAIN_G: Cal = { title: GMAIL, account: GMAIL, calendarId: GMAIL };
const PERSONAL_I: Cal = { title: "Personal", account: "Gmail", calendarId: "ek-personal" };
const MAIN_I: Cal = { title: GMAIL, account: "Gmail", calendarId: "ek-main" };
const WORK_I: Cal = { title: "Календарь", account: "max@company.ru", calendarId: "ek-work" };
const WORK_S: Cal = { title: "Календарь", calendarId: "ek-work" };

describe("CalendarChoice", () => {
	it("a fresh Google API wins the Google calendars", () => {
		const day = choice({
			google: file(2, [MAIN_G, PERSONAL_G], [meeting("google", PERSONAL_G, "at 15", 15)]),
			iphone: file(40, [MAIN_I, PERSONAL_I], [meeting("iphone", PERSONAL_I, "at 14", 14)]),
		}).day(DAY.start, DAY.end);
		expect(titles(day.events)).toEqual(["at 15"]);
		expect(day.stale).toBe(false);
	});

	it("a stale Google API gives way to the app", () => {
		const day = choice({
			google: file(240, [MAIN_G, PERSONAL_G], [meeting("google", PERSONAL_G, "at 15", 15)]),
			iphone: file(40, [MAIN_I, PERSONAL_I], [meeting("iphone", PERSONAL_I, "at 14", 14)]),
		}).day(DAY.start, DAY.end);
		expect(titles(day.events)).toEqual(["at 14"]);
		expect(day.stale).toBe(false);
	});

	it("the app wins the rest, Scriptable takes over when the app is stale", () => {
		const files = (appAgo: number) => ({
			iphone: file(appAgo, [WORK_I], [meeting("iphone", WORK_I, "from the app", 10)]),
			work: file(1, [WORK_S], [meeting("work", WORK_S, "from Scriptable", 11)]),
		});
		expect(titles(choice(files(30)).day(DAY.start, DAY.end).events)).toEqual(["from the app"]);
		expect(titles(choice(files(300)).day(DAY.start, DAY.end).events)).toEqual(["from Scriptable"]);
	});

	it("everything stale: the freshest, and the day is stale", () => {
		const day = choice({
			iphone: file(300, [WORK_I], [meeting("iphone", WORK_I, "from the app", 10)]),
			work: file(200, [WORK_S], [meeting("work", WORK_S, "from Scriptable", 11)]),
		}).day(DAY.start, DAY.end);
		expect(titles(day.events)).toEqual(["from Scriptable"]);
		expect(day.stale).toBe(true);
	});

	it("the Google account named Gmail on the iPhone is matched by its main calendar", () => {
		const calendars = choice({
			google: file(2, [MAIN_G, PERSONAL_G], []),
			iphone: file(5, [MAIN_I, PERSONAL_I, WORK_I], []),
		}).known();
		expect(calendars.map((c) => [c.key.account, c.key.title, c.google])).toEqual([
			[GMAIL, GMAIL, true],
			[GMAIL, "Personal", true],
			["max@company.ru", "Календарь", false],
		]);
	});

	it("the phone's Google account is the one sharing Google's calendar titles, whatever the main one is called", () => {
		const defaultG: Cal = { title: "Default", account: GMAIL, calendarId: GMAIL };
		const plannedG: Cal = { title: "Planned", account: GMAIL, calendarId: "planned" };
		const defaultI: Cal = { title: "Default", account: "Gmail", calendarId: "ek-default" };
		const plannedI: Cal = { title: "Planned", account: "Gmail", calendarId: "ek-planned" };
		const day = choice({
			google: file(2, [defaultG, plannedG], [meeting("google", plannedG, "from Google", 15)]),
			iphone: file(5, [defaultI, plannedI, WORK_I], [meeting("iphone", plannedI, "from the app", 15)]),
		});
		expect(day.known().map((c) => [c.key.account, c.key.title, c.google])).toEqual([
			[GMAIL, "Default", true],
			[GMAIL, "Planned", true],
			["max@company.ru", "Календарь", false],
		]);
		expect(titles(day.day(DAY.start, DAY.end).events)).toEqual(["from Google"]);
	});

	it("no phone account shares Google's titles: none of the phone's calendars is Google's", () => {
		const known = choice({ google: file(2, [MAIN_G, PERSONAL_G], []), iphone: file(5, [WORK_I], []) }).known();
		expect(known.filter((c) => !c.google).map((c) => c.key)).toEqual([{ account: "max@company.ru", title: "Календарь" }]);
	});

	it("of two phone accounts, the one sharing more of Google's titles is Google's, in any case", () => {
		const other: Cal = { title: "Personal", account: "Gmail", calendarId: "ek-other" };
		const known = choice({
			google: file(2, [{ ...MAIN_G, title: "Max@Gmail.com", account: "Max@Gmail.com" }, { ...PERSONAL_G, account: "Max@Gmail.com" }], []),
			iphone: {
				...file(5, [MAIN_I, PERSONAL_I, other], []),
				calendars: [
					{ title: GMAIL, account: "Gmail", calendarId: "ek-main", color: null, sourceId: "src-1" },
					{ title: "Personal", account: "Gmail", calendarId: "ek-personal", color: null, sourceId: "src-1" },
					{ title: "Personal", account: "Gmail", calendarId: "ek-other", color: null, sourceId: "src-2" },
				],
			},
		}).known();
		expect(known.filter((c) => c.google).map((c) => c.key.title)).toEqual(["Max@Gmail.com", "Personal"]);
		expect(known.filter((c) => !c.google).map((c) => c.key)).toEqual([{ account: "Gmail", title: "Personal" }]);
	});

	it("lists the calendars by account, then by title", () => {
		const a1: Cal = { title: "B", account: "iCloud", calendarId: "1" };
		const b1: Cal = { title: "Work", account: "Exchange", calendarId: "2" };
		const a2: Cal = { title: "A", account: "iCloud", calendarId: "3" };
		const known = choice({ iphone: file(5, [a1, b1, a2], []) }).known();
		expect(known.map((c) => `${c.key.account}/${c.key.title}`)).toEqual(["Exchange/Work", "iCloud/A", "iCloud/B"]);
	});

	it("Scriptable's calendar takes the app's account by calendarId", () => {
		const calendars = choice({ iphone: file(5, [WORK_I], []), work: file(5, [WORK_S], []) }).known();
		expect(calendars.map((c) => c.key)).toEqual([{ account: "max@company.ru", title: "Календарь" }]);
	});

	it("an unknown Scriptable calendar matches a unique title", () => {
		const calendars = choice({ google: file(5, [MAIN_G, PERSONAL_G], []), work: file(5, [{ title: "Personal", calendarId: "x" }], []) }).known();
		expect(calendars.map((c) => c.key.title)).toEqual([GMAIL, "Personal"]);
	});

	it("two with that title: its own calendar «iPhone · …»", () => {
		const calendars = choice({
			iphone: file(5, [WORK_I, { title: "Календарь", account: "iCloud", calendarId: "ek-home" }], []),
			work: file(5, [{ title: "Календарь", calendarId: "unknown" }], []),
		}).known();
		expect(calendars.map((c) => c.key)).toContainEqual({ account: "", title: "iPhone · Календарь" });
		expect(calendars.find((c) => c.key.account === "")).toMatchObject({ accountName: "iPhone", name: "Календарь" });
	});

	it("an old Scriptable file covers the days of its events", () => {
		const old = file(5, [WORK_S], [meeting("work", WORK_S, "today", 10), meeting("work", WORK_S, "in a week", 10, 12)], false);
		const calendars = choice({ work: old });
		expect(titles(calendars.day(DAY.start, DAY.end).events)).toEqual(["today"]);
		expect(titles(calendars.day(new Date(2026, 10, 20), new Date(2026, 10, 21)).events)).toEqual([]);
	});

	it("a far day Scriptable does not cover is taken from the stale app file", () => {
		const far = { start: new Date(2026, 11, 5), end: new Date(2026, 11, 6) };
		const scriptable = { ...file(1, [WORK_S], []), from: new Date(2026, 10, 4), to: new Date(2026, 10, 20) };
		const day = choice({ iphone: file(300, [WORK_I], [meeting("iphone", WORK_I, "far", 10, 35)]), work: scriptable }).day(far.start, far.end);
		expect(titles(day.events)).toEqual(["far"]);
		expect(day.stale).toBe(true);
	});

	it("an empty calendar stays known and keeps its file", () => {
		const holidays: Cal = { title: "Holidays", account: "iCloud", calendarId: "ek-hol" };
		const calendars = choice({
			iphone: file(5, [holidays], []),
			work: file(200, [{ title: "Holidays", calendarId: "ek-hol" }], [meeting("work", { title: "Holidays", calendarId: "ek-hol" }, "old", 10)]),
		});
		expect(calendars.known().map((c) => c.key.title)).toEqual(["Holidays"]);
		expect(calendars.day(DAY.start, DAY.end).events).toEqual([]);
	});

	it("a Google file from before accounts were written is still Google's", () => {
		const plain: Cal = { title: "Personal" };
		const day = choice({ google: file(2, [plain], [meeting("google", plain, "lunch", 13)]) }).day(DAY.start, DAY.end);
		expect(titles(day.events)).toEqual(["lunch"]);
	});

	it("a hidden calendar shows nothing and lights no dot", () => {
		const day = choice({ iphone: file(300, [WORK_I], [meeting("iphone", WORK_I, "hidden", 10)]) }, [{ account: "max@company.ru", title: "Календарь" }]).day(
			DAY.start,
			DAY.end,
		);
		expect(day).toEqual({ events: [], stale: false });
	});
});

describe("the order of names", () => {
	it("is the same on every engine: by letters in lower case, «ё» as «е», then as written", () => {
		const names = ["work", "Личное", "Family", "family", "Birthdays", "ёлка", "елка", "Zoo"];
		expect([...names].sort(textOrder)).toEqual(["Birthdays", "Family", "family", "work", "Zoo", "елка", "ёлка", "Личное"]);
	});
});
