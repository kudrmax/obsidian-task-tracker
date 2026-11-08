import type { TaskCalendarSettings } from "../settings";

/** Google is logged in: the settings, shared by every device, keep a refresh token. */
export function googleLoggedIn(settings: Pick<TaskCalendarSettings, "google">): boolean {
	return settings.google.refreshToken !== "";
}
