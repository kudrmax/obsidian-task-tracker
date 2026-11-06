import { SourceProblemError } from "../../core/application/EventSource";
import type { Clock, SettingsStore } from "../../core/application/ports";
import type { TokenResponse } from "./GoogleToken";

/** How the consent screen is shown and answered; the redirect login on Obsidian, a fake in tests. */
export interface LoginFlow {
	login(clientId: string): Promise<string>;
}

const EXPIRY_MARGIN_MS = 60_000;

export class GoogleAuth {
	private accessTokenValue = "";
	private expiresAt = 0;
	private refreshing: { readonly refreshToken: string; readonly promise: Promise<string> } | null = null;

	constructor(
		private readonly settings: SettingsStore,
		private readonly flow: LoginFlow,
		private readonly token: (fields: Record<string, string>) => Promise<TokenResponse>,
		private readonly clock: Clock,
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

	/** Calls that come while the token is being refreshed share that refresh; one answered after a logout is not kept. */
	async accessToken(): Promise<string> {
		const { refreshToken } = this.settings.get().google;
		if (!refreshToken) throw new SourceProblemError({ kind: "loggedOut" }, "not logged in");
		if (this.accessTokenValue && this.clock.now().getTime() < this.expiresAt - EXPIRY_MARGIN_MS) return this.accessTokenValue;
		if (this.refreshing?.refreshToken === refreshToken) return this.refreshing.promise;
		const refreshing = { refreshToken, promise: this.refresh(refreshToken) };
		this.refreshing = refreshing;
		try {
			return await refreshing.promise;
		} finally {
			if (this.refreshing === refreshing) this.refreshing = null;
		}
	}

	private async refresh(refreshToken: string): Promise<string> {
		const token = await this.token({ grant_type: "refresh_token", refresh_token: refreshToken });
		if (this.settings.get().google.refreshToken === refreshToken) {
			this.accessTokenValue = token.access_token;
			this.expiresAt = this.clock.now().getTime() + token.expires_in * 1000;
		}
		return token.access_token;
	}

	private async saveRefreshToken(refreshToken: string): Promise<void> {
		this.accessTokenValue = "";
		this.expiresAt = 0;
		this.refreshing = null;
		await this.settings.update({ google: { ...this.settings.get().google, refreshToken } });
	}
}
