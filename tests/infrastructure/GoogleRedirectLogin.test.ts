import { describe, expect, it } from "vitest";
import { GoogleRedirectLogin, REDIRECT_URI, type RedirectLoginDeps } from "../../src/infrastructure/GoogleRedirectLogin";

function deps(overrides: Partial<RedirectLoginDeps> = {}) {
	const opened: string[] = [];
	const exchanged: Record<string, string>[] = [];
	const timers: { fn: () => void; cleared: boolean }[] = [];
	const d: RedirectLoginDeps = {
		open: (url) => opened.push(url),
		exchange: async (fields) => {
			exchanged.push(fields);
			return { access_token: "a", expires_in: 3600, refresh_token: "r" };
		},
		random: (bytes) => new Uint8Array(bytes).map((_, i) => i + 1),
		sha256: async (text) => new TextEncoder().encode(text.slice(0, 8)),
		setTimeout: (fn) => {
			timers.push({ fn, cleared: false });
			return timers.length - 1;
		},
		clearTimeout: (handle) => {
			timers[handle as number].cleared = true;
		},
		...overrides,
	};
	return { d, opened, exchanged, timers };
}

const stateOf = (url: string) => new URL(url).searchParams.get("state")!;
/** login() hashes the verifier before it opens the browser: the test waits for that. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("GoogleRedirectLogin", () => {
	it("opens the consent screen with PKCE, offline access and the redirect page", async () => {
		const { d, opened } = deps();
		const login = new GoogleRedirectLogin(d);
		const done = login.login("id");
		await flush();
		const url = new URL(opened[0]);
		expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
		expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
		expect(url.searchParams.get("client_id")).toBe("id");
		expect(url.searchParams.get("access_type")).toBe("offline");
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar.readonly");
		expect(login.waiting).toBe(true);
		await login.receive({ code: "c", state: stateOf(opened[0]) });
		await expect(done).resolves.toBe("r");
	});

	it("exchanges the code with the verifier and the redirect page, then stops waiting", async () => {
		const { d, opened, exchanged, timers } = deps();
		const login = new GoogleRedirectLogin(d);
		const done = login.login("id");
		await flush();
		await login.receive({ code: "the-code", state: stateOf(opened[0]) });
		await done;
		expect(exchanged[0]).toMatchObject({ code: "the-code", grant_type: "authorization_code", redirect_uri: REDIRECT_URI });
		expect(exchanged[0].code_verifier).toHaveLength(43);
		expect(login.waiting).toBe(false);
		expect(timers[0].cleared).toBe(true);
	});

	it("refuses an answer with another state, and keeps waiting for the right one", async () => {
		const { d, opened } = deps();
		const login = new GoogleRedirectLogin(d);
		const done = login.login("id");
		await flush();
		await expect(login.receive({ code: "c", state: "forged" })).rejects.toThrow("another login");
		expect(login.waiting).toBe(true);
		await login.receive({ code: "c", state: stateOf(opened[0]) });
		await expect(done).resolves.toBe("r");
	});

	it("fails the login when Google refuses, when no code comes, and when no login waits", async () => {
		const { d, opened } = deps();
		const login = new GoogleRedirectLogin(d);
		const done = login.login("id");
		await flush();
		await expect(login.receive({ error: "access_denied", state: stateOf(opened[0]) })).rejects.toThrow("access_denied");
		await expect(done).rejects.toThrow("access_denied");
		await expect(login.receive({ code: "c", state: "x" })).rejects.toThrow("No login is waiting");
	});

	it("fails the login when Google returns no refresh token", async () => {
		const { d, opened } = deps({ exchange: async () => ({ access_token: "a", expires_in: 1 }) });
		const login = new GoogleRedirectLogin(d);
		const done = login.login("id");
		await flush();
		await expect(login.receive({ code: "c", state: stateOf(opened[0]) })).rejects.toThrow("no refresh token");
		await expect(done).rejects.toThrow("no refresh token");
	});

	it("times out, and a newer login replaces an older one", async () => {
		const { d, timers, opened } = deps();
		const login = new GoogleRedirectLogin(d);
		const first = login.login("id");
		await flush();
		timers[0].fn();
		await expect(first).rejects.toThrow("five minutes");
		const second = login.login("id");
		await flush();
		const replaced = expect(second).rejects.toThrow("newer login");
		const third = login.login("id");
		await flush();
		await replaced;
		await login.receive({ code: "c", state: stateOf(opened[2]) });
		await expect(third).resolves.toBe("r");
	});
});
