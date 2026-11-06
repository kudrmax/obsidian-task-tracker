import { describe, expect, it } from "vitest";
import type { Clock } from "../../core/application/ports";
import { GoogleAuth } from "../../obsidian/infrastructure/GoogleAuth";
import type { TokenResponse } from "../../obsidian/infrastructure/GoogleToken";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";

class ManualClock implements Clock {
	private at = new Date(2026, 9, 30, 10).getTime();
	now(): Date {
		return new Date(this.at);
	}
	pass(ms: number): void {
		this.at += ms;
	}
}

/** The token endpoint, answered by hand: each call waits until the test answers or fails it. */
class FakeToken {
	readonly calls: Record<string, string>[] = [];
	private readonly waiting: { resolve: (t: TokenResponse) => void; reject: (e: Error) => void }[] = [];

	readonly request = (fields: Record<string, string>): Promise<TokenResponse> => {
		this.calls.push(fields);
		return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }));
	};

	answer(access_token: string, expires_in = 3600): void {
		this.waiting.shift()?.resolve({ access_token, expires_in });
	}

	fail(): void {
		this.waiting.shift()?.reject(new Error("Google token endpoint 500"));
	}
}

function auth() {
	const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, google: { ...DEFAULT_SETTINGS.google, clientId: "id", clientSecret: "secret", refreshToken: "r" } });
	const token = new FakeToken();
	const clock = new ManualClock();
	const google = new GoogleAuth(settings, { login: async () => "r2" }, token.request, clock);
	return { google, token, clock, settings };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("GoogleAuth", () => {
	it("two calls at once refresh the token once", async () => {
		const { google, token } = auth();
		const first = google.accessToken();
		const second = google.accessToken();
		token.answer("a1");
		expect(await Promise.all([first, second])).toEqual(["a1", "a1"]);
		expect(token.calls).toHaveLength(1);
	});

	it("a token still valid is reused; one about to expire is refreshed", async () => {
		const { google, token, clock } = auth();
		const first = google.accessToken();
		token.answer("a1", 3600);
		await first;
		clock.pass(30 * 60_000);
		expect(await google.accessToken()).toBe("a1");
		expect(token.calls).toHaveLength(1);
		clock.pass(29.5 * 60_000);
		const again = google.accessToken();
		token.answer("a2");
		expect(await again).toBe("a2");
		expect(token.calls).toHaveLength(2);
	});

	it("a refresh that failed lets the next call try again", async () => {
		const { google, token } = auth();
		const first = google.accessToken();
		token.fail();
		await expect(first).rejects.toThrow("500");
		const second = google.accessToken();
		token.answer("a1");
		expect(await second).toBe("a1");
		expect(token.calls).toHaveLength(2);
	});

	it("a token answered after logout is not kept", async () => {
		const { google, token, settings } = auth();
		const inFlight = google.accessToken();
		await google.logout();
		token.answer("old");
		await inFlight.catch(() => undefined);
		await settings.update({ google: { ...settings.get().google, refreshToken: "r2" } });
		const next = google.accessToken();
		await tick();
		expect(token.calls).toHaveLength(2);
		expect(token.calls[1].refresh_token).toBe("r2");
		token.answer("new");
		expect(await next).toBe("new");
	});
});
