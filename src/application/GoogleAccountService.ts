import type { GoogleSettings } from "../settings";
import type { CalendarOption, GoogleAccount } from "./contracts";
import type { GoogleCalendarList, GoogleLogin, SettingsStore } from "./ports";

/** The Google account over the login and the calendar list; which calendars are shown is kept in the settings. */
export class GoogleAccountService implements GoogleAccount {
	constructor(
		private readonly auth: GoogleLogin,
		private readonly calendars: GoogleCalendarList,
		private readonly settings: SettingsStore,
	) {}

	isLoggedIn(): boolean {
		return this.auth.isLoggedIn();
	}

	login(): Promise<string> {
		return this.auth.login();
	}

	logout(): Promise<void> {
		return this.auth.logout();
	}

	listCalendars(): Promise<readonly CalendarOption[]> {
		return this.calendars.listCalendars();
	}

	isShown(id: string): boolean {
		const ids = this.google.calendarIds;
		return ids.length === 0 || ids.includes(id);
	}

	/** Every calendar shown is kept as none listed, so a calendar added in Google later shows too. */
	setShown(all: readonly CalendarOption[], id: string, shown: boolean): Promise<void> {
		const selected = new Set(all.filter((c) => this.isShown(c.id)).map((c) => c.id));
		if (shown) selected.add(id);
		else selected.delete(id);
		const calendarIds = all.every((c) => selected.has(c.id)) ? [] : [...selected];
		return this.settings.update({ google: { ...this.google, calendarIds } });
	}

	private get google(): GoogleSettings {
		return this.settings.get().google;
	}
}
