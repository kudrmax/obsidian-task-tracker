import { describe, expect, it } from "vitest";
import { GoogleAccountService } from "../../src/application/GoogleAccountService";
import type { GoogleLogin } from "../../src/application/ports";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
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

function account() {
	const settings = new FakeSettingsStore(DEFAULT_SETTINGS);
	return { google: new GoogleAccountService(new FakeLogin(settings)) };
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
});
