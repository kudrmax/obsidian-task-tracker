import type { TokenResponse } from "./GoogleToken";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
/** The page Google sends the browser back to; it hands the code on to Obsidian (docs/auth.html, served by GitHub Pages). */
export const REDIRECT_URI = "https://kudrmax.github.io/obsidian-task-tracker/auth.html";
/** The obsidian:// action that page opens: obsidian://task-calendar?code=…&state=… */
export const PROTOCOL_ACTION = "task-calendar";
const LOGIN_TIMEOUT_MS = 5 * 60_000;

export interface RedirectLoginDeps {
	/** Opens the URL in the system browser. */
	open(url: string): void;
	/** Exchanges a code for tokens at Google's token endpoint. */
	exchange(fields: Record<string, string>): Promise<TokenResponse>;
	/** Random bytes for the PKCE verifier and the state. */
	random(bytes: number): Uint8Array;
	sha256(text: string): Promise<Uint8Array>;
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

interface Pending {
	readonly state: string;
	readonly verifier: string;
	readonly resolve: (refreshToken: string) => void;
	readonly reject: (error: Error) => void;
	readonly timer: unknown;
}

export function base64Url(bytes: Uint8Array): string {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The login on any device: the browser opens Google's consent screen, Google sends it to the redirect page, the page
 * opens obsidian://task-calendar with the code, and `receive` turns the code into the refresh token. PKCE and a state
 * tie the answer to the request; a login nobody answers times out.
 */
export class GoogleRedirectLogin {
	private pending: Pending | null = null;

	constructor(private readonly deps: RedirectLoginDeps) {}

	async login(clientId: string): Promise<string> {
		this.cancel(new Error("A newer login replaced this one"));
		const verifier = base64Url(this.deps.random(32));
		const challenge = base64Url(await this.deps.sha256(verifier));
		const state = base64Url(this.deps.random(16));
		const params = new URLSearchParams({
			client_id: clientId,
			redirect_uri: REDIRECT_URI,
			response_type: "code",
			scope: SCOPE,
			access_type: "offline",
			prompt: "consent",
			code_challenge: challenge,
			code_challenge_method: "S256",
			state,
		});
		return new Promise<string>((resolve, reject) => {
			const timer = this.deps.setTimeout(() => this.cancel(new Error("Google did not answer within five minutes")), LOGIN_TIMEOUT_MS);
			this.pending = { state, verifier, resolve, reject, timer };
			this.deps.open(`${AUTH_URL}?${params.toString()}`);
		});
	}

	get waiting(): boolean {
		return this.pending !== null;
	}

	/** What the redirect page sent back through obsidian://. */
	async receive(params: Record<string, string>): Promise<void> {
		const pending = this.pending;
		if (!pending) throw new Error("No login is waiting for Google's answer");
		if (params.state !== pending.state) throw new Error("Google's answer belongs to another login");
		this.pending = null;
		this.deps.clearTimeout(pending.timer);
		if (params.error || !params.code) {
			const error = new Error(params.error ? `Google refused: ${params.error}` : "Google's answer carries no code");
			pending.reject(error);
			throw error;
		}
		try {
			const token = await this.deps.exchange({ code: params.code, code_verifier: pending.verifier, grant_type: "authorization_code", redirect_uri: REDIRECT_URI });
			if (!token.refresh_token) throw new Error("Google returned no refresh token");
			pending.resolve(token.refresh_token);
		} catch (e) {
			pending.reject(e instanceof Error ? e : new Error(String(e)));
			throw e;
		}
	}

	private cancel(reason: Error): void {
		const pending = this.pending;
		if (!pending) return;
		this.pending = null;
		this.deps.clearTimeout(pending.timer);
		pending.reject(reason);
	}
}

/** The deps of a real Obsidian window. */
export function browserLoginDeps(exchange: RedirectLoginDeps["exchange"]): RedirectLoginDeps {
	return {
		open: (url) => void window.open(url),
		exchange,
		random: (bytes) => crypto.getRandomValues(new Uint8Array(bytes)),
		sha256: async (text) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
		setTimeout: (fn, ms) => window.setTimeout(fn, ms),
		clearTimeout: (handle) => window.clearTimeout(handle as number),
	};
}
