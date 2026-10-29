import { Platform } from "obsidian";
import { requestToken } from "./GoogleToken";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const DONE_PAGE = "<h2>Done. You can go back to Obsidian.</h2>";

function base64Url(bytes: Uint8Array): string {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkce(): Promise<{ verifier: string; challenge: string }> {
	const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

/**
 * The only module with Node code: opens the browser, waits for Google's redirect to a loopback server,
 * exchanges the code and returns the refresh token. Desktop only.
 */
export async function login(clientId: string, clientSecret: string): Promise<string> {
	if (!Platform.isDesktop) throw new Error("Log in on the Mac; the token syncs to the phone");
	const http = require("http") as typeof import("http");
	const { verifier, challenge } = await pkce();
	const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));

	return new Promise<string>((resolve, reject) => {
		let redirectUri = "";
		const server = http.createServer(async (req, res) => {
			const url = new URL(req.url ?? "/", "http://127.0.0.1");
			if (url.pathname !== "/callback") {
				res.writeHead(404).end();
				return;
			}
			const code = url.searchParams.get("code");
			const gotState = url.searchParams.get("state");
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(DONE_PAGE);
			server.close();
			if (!code || gotState !== state) {
				reject(new Error("OAuth callback without a code or with a wrong state"));
				return;
			}
			try {
				const token = await requestToken(clientId, clientSecret, {
					code,
					code_verifier: verifier,
					grant_type: "authorization_code",
					redirect_uri: redirectUri,
				});
				if (!token.refresh_token) throw new Error("Google returned no refresh token");
				resolve(token.refresh_token);
			} catch (e) {
				reject(e);
			}
		});
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			redirectUri = `http://127.0.0.1:${port}/callback`;
			const params = new URLSearchParams({
				client_id: clientId,
				redirect_uri: redirectUri,
				response_type: "code",
				scope: SCOPE,
				access_type: "offline",
				prompt: "consent",
				code_challenge: challenge,
				code_challenge_method: "S256",
				state,
			});
			window.open(`${AUTH_URL}?${params.toString()}`);
		});
	});
}
