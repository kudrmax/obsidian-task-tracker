import type { SDKAssistantMessageError, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { FailureKind, ModelReply, StopReason } from "../../../core/application/contracts";

/** How the stream of one call ended: it ran out, or `query()` threw. */
export type StreamEnd = { readonly kind: "done" } | { readonly kind: "threw"; readonly error: unknown };

/** Where the credential comes from when no API key is billed: a subscription login says "none" (seen in the spike), an older CLI "oauth". */
const SUBSCRIPTION_SOURCES: ReadonlySet<string> = new Set(["none", "oauth"]);

export function billsSubscription(apiKeySource: string): boolean {
	return SUBSCRIPTION_SOURCES.has(apiKeySource);
}

/** The assistant message's own failure, by the SDK's code. */
const ERROR_KINDS: Readonly<Record<SDKAssistantMessageError, FailureKind>> = {
	authentication_failed: "signedOut",
	billing_error: "noAccess",
	account_on_hold: "noAccess",
	oauth_org_not_allowed: "noAccess",
	verification_required: "noAccess",
	cloud_credential_error: "noAccess",
	rate_limit: "limit",
	overloaded: "busy",
	server_error: "busy",
	model_not_found: "badModel",
	invalid_request: "unknown",
	max_output_tokens: "unknown",
	unknown: "unknown",
};

/** The CLI's own words for a connection that dropped or never came up (its error builder, Claude Code 2.1.325). */
const CONNECTION_LOST = /Connection lost|went to sleep before a response|Unable to connect to API/;

/** A retry's HTTP status, as the last one before the timeout tells why there was no answer. */
function kindOfRetry(status: number | null): FailureKind {
	if (status === null) return "offline";
	if (status === 429) return "limit";
	if (status >= 500) return "busy";
	return "timeout";
}

function textOf(message: Extract<SDKMessage, { type: "assistant" }>): string {
	const content = (message.message as { content?: readonly { type: string; text?: string }[] }).content ?? [];
	return content
		.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join(" ");
}

function failure(kind: FailureKind, detail: string): ModelReply {
	return { ok: false, failure: { kind, detail: `Claude: ${detail}` } };
}

function errorText(error: unknown): string {
	return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function errorCode(error: unknown): unknown {
	return typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
}

/**
 * The reply a call's messages come to (spec, «Claude: reading the stream»): one table, read in this order. Max's Stop
 * wins over everything; an API key in use stops the run before any answer counts; a stop by the timeout says why by the
 * last retry; then the stream's own failures, then the result.
 */
export function claudeReply(messages: readonly SDKMessage[], end: StreamEnd, stopped: StopReason | null): ModelReply {
	if (stopped === "user") return failure("stopped", "stopped by the user");
	const init = messages.find((m): m is Extract<SDKMessage, { type: "system"; subtype: "init" }> => m.type === "system" && m.subtype === "init");
	if (init && !billsSubscription(init.apiKeySource)) return failure("noAccess", `the call would bill an API key (apiKeySource "${init.apiKeySource}"), not the subscription`);
	if (stopped === "timeout") {
		const retry = [...messages].reverse().find((m): m is Extract<SDKMessage, { subtype: "api_retry" }> => m.type === "system" && m.subtype === "api_retry");
		return retry
			? failure(kindOfRetry(retry.error_status), `no answer before the timeout; the last retry: ${retry.error} (status ${retry.error_status ?? "none"})`)
			: failure("timeout", "no answer before the timeout");
	}
	for (const message of messages) {
		if (message.type === "rate_limit_event" && message.rate_limit_info.status === "rejected") return failure("limit", `usage limit reached (${message.rate_limit_info.rateLimitType ?? "unknown limit"})`);
		if (message.type === "assistant" && message.error) {
			const text = textOf(message);
			const kind = CONNECTION_LOST.test(text) ? "offline" : ERROR_KINDS[message.error];
			return failure(kind, `${message.error}: ${text}`);
		}
	}
	if (end.kind === "threw") {
		const code = errorCode(end.error);
		if (code === "ENOENT" || /\bENOENT\b/.test(errorText(end.error))) return failure("notInstalled", errorText(end.error));
		return failure("unknown", errorText(end.error));
	}
	const result = messages.find((m): m is Extract<SDKMessage, { type: "result" }> => m.type === "result");
	if (!result) return failure("unknown", "the stream ended with no result");
	if (result.subtype === "success") {
		if (!result.is_error && result.structured_output !== undefined) return { ok: true, answer: result.structured_output };
		return failure("badAnswer", result.is_error ? `the result is an error: ${result.result}` : "the result has no structured output");
	}
	if (result.subtype === "error_max_structured_output_retries") return failure("badAnswer", "the answer never matched the shape asked for");
	return failure("unknown", `result ${result.subtype}`);
}
