import { describe, expect, it } from "vitest";
import type { CalendarOption } from "../../src/application/contracts";
import { GoogleAccountService } from "../../src/application/GoogleAccountService";
import type { GoogleLogin } from "../../src/application/ports";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";

const CALENDARS: readonly CalendarOption[] = [
	{ id: "home", title: "Home", color: "#4285F4" },
	{ id: "gym", title: "Gym", color: "#0B8043" },
	{ id: "trips", title: "Trips", color: "#F4511E" },
];

/** Logged in the way GoogleAuth is: the refresh token in the settings. */
class FakeLogin implements GoogleLogin {
	constructor(private readonly settings: FakeSettingsStore) {}

	isLoggedIn(): boolean {
		return this.settings.get().google.refreshToken !== "";
	}

	async login(): Promise<string> {
		await this.settings.update({ google: { ...this.settings.get().google, refreshToken: "refresh" } });
		return "refresh";
	}

	async logout(): Promise<void> {
		await this.settings.update({ google: { ...this.settings.get().google, refreshToken: "" } });
	}
}

function account(calendarIds: string[] = []) {
	const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, google: { ...DEFAULT_SETTINGS.google, calendarIds } });
	let lists = 0;
	const google = new GoogleAccountService(new FakeLogin(settings), { listCalendars: async () => (lists++, CALENDARS) }, settings);
	return { google, settings, lists: () => lists };
}

describe("GoogleAccountService", () => {
	it("is logged in while the login says so", async () => {
		const { google } = account();
		expect(google.isLoggedIn()).toBe(false);
		await google.login();
		expect(google.isLoggedIn()).toBe(true);
		await google.logout();
		expect(google.isLoggedIn()).toBe(false);
	});

	it("asks the list of calendars each time", async () => {
		const { google, lists } = account();
		expect(await google.listCalendars()).toEqual(CALENDARS);
		await google.listCalendars();
		expect(lists()).toBe(2);
	});

	it("shows every calendar while none is listed", () => {
		const { google } = account();
		expect(CALENDARS.every((c) => google.isShown(c.id))).toBe(true);
	});

	it("shows only the listed calendars once some are", () => {
		const { google } = account(["home"]);
		expect(google.isShown("home")).toBe(true);
		expect(google.isShown("gym")).toBe(false);
	});

	it("lists the others when one is unchecked", async () => {
		const { google, settings } = account();
		await google.setShown(CALENDARS, "gym", false);
		expect(settings.get().google.calendarIds).toEqual(["home", "trips"]);
		expect(google.isShown("gym")).toBe(false);
	});

	it("lists none again once the last one is checked back", async () => {
		const { google, settings } = account(["home", "trips"]);
		await google.setShown(CALENDARS, "gym", true);
		expect(settings.get().google.calendarIds).toEqual([]);
	});

	it("keeps the rest of the Google settings", async () => {
		const { google, settings } = account();
		await google.login();
		await google.setShown(CALENDARS, "home", false);
		expect(settings.get().google).toEqual({ ...DEFAULT_SETTINGS.google, refreshToken: "refresh", calendarIds: ["gym", "trips"] });
	});
});
