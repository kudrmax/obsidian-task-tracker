import { describe, expect, it } from "vitest";
import type { KnownCalendar } from "../../src/application/calendarChoice";
import { migratedHidden } from "../../src/application/calendarMigration";
import { DEFAULT_SETTINGS } from "../../src/settings";

const GMAIL = "max@gmail.com";
const known: KnownCalendar[] = [
	{ key: { account: GMAIL, title: GMAIL }, color: null, google: true },
	{ key: { account: GMAIL, title: "Personal" }, color: null, google: true },
	{ key: { account: "max@company.ru", title: "Календарь" }, color: null, google: false },
	{ key: { account: "iCloud", title: "Home" }, color: null, google: false },
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

	it("nothing chosen hides nothing", () => {
		expect(migratedHidden(settings([], []), known, googleIds)).toEqual([]);
	});
});
