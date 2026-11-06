import type { GoogleAccount } from "./contracts";
import type { GoogleLogin } from "./ports";

/** The Google account over the login: the refresh token kept in the settings. */
export class GoogleAccountService implements GoogleAccount {
	constructor(private readonly auth: GoogleLogin) {}

	isLoggedIn(): boolean {
		return this.auth.isLoggedIn();
	}

	login(): Promise<string> {
		return this.auth.login();
	}

	logout(): Promise<void> {
		return this.auth.logout();
	}
}
