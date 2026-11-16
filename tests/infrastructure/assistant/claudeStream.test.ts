import type { SDKAssistantMessageError, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import { claudeReply, type StreamEnd } from "../../../obsidian/infrastructure/assistant/claudeStream";

/** Messages shaped as the SDK's types, with only the fields the reading uses. */
const as = (message: object) => message as SDKMessage;
const init = (apiKeySource = "none") => as({ type: "system", subtype: "init", apiKeySource });
const assistant = (error?: SDKAssistantMessageError, text = "") => as({ type: "assistant", error, message: { content: [{ type: "text", text }] } });
const success = (fields: object = { structured_output: { taskRef: "t1", reason: "Because." } }) => as({ type: "result", subtype: "success", is_error: false, result: "", ...fields });
const retry = (error_status: number | null) => as({ type: "system", subtype: "api_retry", error_status, error: "server_error" });
const rateLimit = (status: string) => as({ type: "rate_limit_event", rate_limit_info: { status, rateLimitType: "five_hour" } });
const DONE: StreamEnd = { kind: "done" };
const threw = (error: unknown): StreamEnd => ({ kind: "threw", error });

const kind = (messages: SDKMessage[], end: StreamEnd = DONE, stopped: "user" | "timeout" | null = null) => {
	const reply = claudeReply(messages, end, stopped);
	return reply.ok ? "ok" : reply.failure.kind;
};

/** An abort as the SDK throws it after a stop. */
class AbortError extends Error {
	override name = "AbortError";
}

describe("claudeReply: the spec's table «Claude: reading the stream»", () => {
	it("a success with structured output is the answer, as the spike's stream went", () => {
		const reply = claudeReply([init(), assistant(), as({ type: "user" }), rateLimit("allowed"), success()], DONE, null);
		expect(reply).toEqual({ ok: true, answer: { taskRef: "t1", reason: "Because." } });
	});

	it.each([
		["a success that is an error", success({ is_error: true, result: "oops" })],
		["a success with no structured output", success({ structured_output: undefined })],
		["the structured output never matched", as({ type: "result", subtype: "error_max_structured_output_retries", is_error: true })],
	])("%s is badAnswer", (_, result) => {
		expect(kind([init(), result])).toBe("badAnswer");
	});

	it.each<[SDKAssistantMessageError, string]>([
		["authentication_failed", "signedOut"],
		["billing_error", "noAccess"],
		["account_on_hold", "noAccess"],
		["oauth_org_not_allowed", "noAccess"],
		["verification_required", "noAccess"],
		["cloud_credential_error", "noAccess"],
		["rate_limit", "limit"],
		["overloaded", "busy"],
		["server_error", "busy"],
		["model_not_found", "badModel"],
		["invalid_request", "unknown"],
		["max_output_tokens", "unknown"],
		["unknown", "unknown"],
	])("an assistant error %s is %s, over the result that follows it", (error, expected) => {
		expect(kind([init(), assistant(error, "API Error"), success({ is_error: true })])).toBe(expected);
	});

	it.each([
		"API Error: Connection lost before a response was produced. Try again.",
		"API Error: Connection lost mid-response. The response above may be incomplete.",
		"API Error: Your computer went to sleep before a response was produced. Try again.",
		"Unable to connect to API. Check your internet connection",
	])("a lost connection in the CLI's own words is offline: %s", (text) => {
		expect(kind([init(), assistant("server_error", text)])).toBe("offline");
		expect(kind([init(), assistant("unknown", text)])).toBe("offline");
	});

	it("a rate limit event rejected is limit; allowed or a warning changes nothing", () => {
		expect(kind([init(), rateLimit("rejected"), success({ is_error: true })])).toBe("limit");
		expect(kind([init(), rateLimit("allowed_warning"), success()])).toBe("ok");
	});

	it("a thrown ENOENT is notInstalled; any other throw unknown", () => {
		expect(kind([], threw(Object.assign(new Error("spawn /x/claude ENOENT"), { code: "ENOENT" })))).toBe("notInstalled");
		expect(kind([], threw(new Error("Failed to spawn Claude Code process: spawn ENOENT")))).toBe("notInstalled");
		expect(kind([init()], threw(new TypeError("boom")))).toBe("unknown");
	});

	it("Max's Stop is stopped, whatever arrived or was thrown", () => {
		expect(kind([init()], threw(new AbortError("Claude Code process aborted by user")), "user")).toBe("stopped");
		expect(kind([init(), success()], DONE, "user")).toBe("stopped");
	});

	it("a stop by the timeout says why by the last retry: no status offline, 429 limit, 5xx busy, none timeout", () => {
		const timedOut = (...messages: SDKMessage[]) => kind([init(), ...messages], threw(new AbortError("aborted")), "timeout");
		expect(timedOut(retry(429), retry(null))).toBe("offline");
		expect(timedOut(retry(null), retry(429))).toBe("limit");
		expect(timedOut(retry(529))).toBe("busy");
		expect(timedOut(retry(500))).toBe("busy");
		expect(timedOut(retry(400))).toBe("timeout");
		expect(timedOut()).toBe("timeout");
	});

	it("an API key in use is noAccess before any answer counts: only none (a subscription login) and oauth pass", () => {
		for (const source of ["ANTHROPIC_API_KEY", "apiKeyHelper", "/login managed key", "user", "project", "org", "temporary"]) expect(kind([init(source), success()])).toBe("noAccess");
		expect(kind([init("none"), success()])).toBe("ok");
		expect(kind([init("oauth"), success()])).toBe("ok");
	});

	it("a stream with no result, or another result, is unknown", () => {
		expect(kind([init()])).toBe("unknown");
		expect(kind([init(), as({ type: "result", subtype: "error_during_execution", is_error: true })])).toBe("unknown");
	});

	it("every failure carries its detail for the console", () => {
		const reply = claudeReply([init(), assistant("rate_limit", "You've hit your limit")], DONE, null);
		expect(reply).toMatchObject({ ok: false, failure: { kind: "limit", detail: expect.stringContaining("hit your limit") } });
	});
});
