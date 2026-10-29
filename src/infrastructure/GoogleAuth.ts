import type { SettingsStore } from "../application/ports";
import { login } from "./GoogleLoopbackLogin";
import { requestToken } from "./GoogleToken";

const EXPIRY_MARGIN_MS = 60_000;

export class GoogleAuth {
	private accessTokenValue = "";
	private expiresAt = 0;

	constructor(private readonly settings: SettingsStore) {}

	isLoggedIn(): boolean {
		return this.settings.get().google.refreshToken !== "";
	}

	/** Desktop only: runs the loopback login and stores the refresh token in the settings. */
	async login(): Promise<string> {
		const { clientId, clientSecret } = this.settings.get().google;
		if (!clientId || !clientSecret) throw new Error("Client id and secret are required");
		const refreshToken = await login(clientId, clientSecret);
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
