import { requestUrl } from "obsidian";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface TokenResponse {
	readonly access_token: string;
	readonly expires_in: number;
	readonly refresh_token?: string;
}

export async function requestToken(clientId: string, clientSecret: string, fields: Record<string, string>): Promise<TokenResponse> {
	const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...fields });
	const res = await requestUrl({
		url: TOKEN_URL,
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
		throw: false,
	});
	if (res.status >= 400) throw new Error(`Google token endpoint ${res.status}: ${res.text}`);
	return res.json as TokenResponse;
}
