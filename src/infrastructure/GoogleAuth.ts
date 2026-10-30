import type { SettingsStore } from "../application/ports";
import { requestToken } from "./GoogleToken";

/** How the consent screen is shown and answered; the redirect login on Obsidian, a fake in tests. */
export interface LoginFlow {
	login(clientId: string): Promise<string>;
}

const EXPIRY_MARGIN_MS = 60_000;

export class GoogleAuth {
	private accessTokenValue = "";
	private expiresAt = 0;

	constructor(
		private readonly settings: SettingsStore,
		private readonly flow: LoginFlow,
	) {}

	isLoggedIn(): boolean {
		return this.settings.get().google.refreshToken !== "";
	}

	/** Runs the login flow and stores the refresh token in the settings; the same on the Mac and on the phone. */
	async login(): Promise<string> {
		const { clientId, clientSecret } = this.settings.get().google;
		if (!clientId || !clientSecret) throw new Error("Client id and secret are required");
		const refreshToken = await this.flow.login(clientId);
		await this.saveRefreshToken(refreshToken);
		return refreshToken;
	}

	async logout(): Promise<void> {
		await this.saveRefreshToken("");
	}

	async accessToken(): Promise<string> {
		const { clientId, clientSecret, refreshToken } = this.settings.get().google;
		if (!refreshToken) throw new Error("not logged in");
		if (this.accessTokenValue && Date.now() < this.expiresAt - EXPIRY_MARGIN_MS) return this.accessTokenValue;
		const token = await requestToken(clientId, clientSecret, { grant_type: "refresh_token", refresh_token: refreshToken });
		this.accessTokenValue = token.access_token;
		this.expiresAt = Date.now() + token.expires_in * 1000;
		return this.accessTokenValue;
	}

	private async saveRefreshToken(refreshToken: string): Promise<void> {
		this.accessTokenValue = "";
		this.expiresAt = 0;
		await this.settings.update({ google: { ...this.settings.get().google, refreshToken } });
	}
}
