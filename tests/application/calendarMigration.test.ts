import { describe, expect, it } from "vitest";
import type { KnownCalendar } from "../../core/application/calendarChoice";
import { migratedHidden } from "../../core/application/calendarMigration";
import { DEFAULT_SETTINGS } from "../../core/settings";

const GMAIL = "max@gmail.com";
const known: KnownCalendar[] = [
	{ key: { account: GMAIL, title: GMAIL }, accountName: GMAIL, name: GMAIL, color: null, google: true },
	{ key: { account: GMAIL, title: "Personal" }, accountName: GMAIL, name: "Personal", color: null, google: true },
	{ key: { account: "max@company.ru", title: "Календарь" }, accountName: "max@company.ru", name: "Календарь", color: null, google: false },
	{ key: { account: "iCloud", title: "Home" }, accountName: "iCloud", name: "Home", color: null, google: false },
];
const googleIds = new Map([
	["max@gmail.com", GMAIL],
	["personal-id", "Personal"],
]);
const settings = (google: string[], work: string[]) => ({ ...DEFAULT_SETTINGS, workCalendarTitles: work, google: { ...DEFAULT_SETTINGS.google, calendarIds: google } });

describe("migratedHidden", () => {
	it("hides the Google calendars left unchecked", () => {
		expect(migratedHidden(settings(["personal-id"], []), known, googleIds)).toEqual([{ account: GMAIL, title: GMAIL }]);
	});

	it("hides the work calendars not named, never a Google one", () => {
		expect(migratedHidden(settings([], ["календарь"]), known, googleIds)).toEqual([{ account: "iCloud", title: "Home" }]);
	});

	it("a Google file without ids (before phase 2) hides no Google calendar", () => {
		expect(migratedHidden(settings(["personal-id"], []), known, new Map())).toEqual([]);
	});

	it("nothing chosen hides nothing", () => {
		expect(migratedHidden(settings([], []), known, googleIds)).toEqual([]);
	});
});
