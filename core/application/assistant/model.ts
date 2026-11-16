/** A JSON Schema as plain data: what the answer must look like, sent to the model beside the question. */
export type JsonSchema = { readonly [key: string]: JsonValue };
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** One question to a model: the prompt, the tasks as JSON, the shape the answer must take. */
export interface ModelQuestion {
	/** The prompt from the settings. */
	readonly instructions: string;
	/** The briefing, JSON. */
	readonly input: string;
	readonly answerSchema: JsonSchema;
}

/** Why a model gave no answer; what Max is told to do for each is its profile's. */
export type FailureKind =
	| "notInstalled"
	| "signedOut"
	| "noAccess"
	| "limit"
	| "busy"
	| "offline"
	/** The model name in the settings is unknown. */
	| "badModel"
	| "timeout"
	| "badAnswer"
	| "stopped"
	| "unknown";

/** Every failure kind, in the order of the type. */
export const FAILURE_KINDS: readonly FailureKind[] = ["notInstalled", "signedOut", "noAccess", "limit", "busy", "offline", "badModel", "timeout", "badAnswer", "stopped", "unknown"];

export interface ModelFailure {
	readonly kind: FailureKind;
	/** For the console. */
	readonly detail: string;
}

/** A model's reply: its answer parsed from JSON, not yet trusted, or why there is none. */
export type ModelReply = { readonly ok: true; readonly answer: unknown } | { readonly ok: false; readonly failure: ModelFailure };

/** Why a run was stopped: Max's Stop, or the timeout. */
export type StopReason = "user" | "timeout";

/** Stopping without AbortSignal (neither ES2021 nor JavaScriptCore has it). `onStop` returns the unsubscribe. */
export interface StopSignal {
	readonly stopped: StopReason | null;
	onStop(fn: (reason: StopReason) => void): () => void;
}

/** How a host asks one model. Never throws: every failure is a reply. Logs its own detail. */
export interface ModelTransport {
	ask(question: ModelQuestion, modelSettings: Readonly<Record<string, string>>, stop: StopSignal): Promise<ModelReply>;
	/** A hint for a settings field, found on this host (Claude: the path of `claude` found, or «not found»). */
	hint?(fieldKey: string, modelSettings: Readonly<Record<string, string>>): Promise<string | null>;
}

/** A host's transport, loaded only when first used (the SDK must not load on the phone). */
export type TransportLoader = () => Promise<ModelTransport>;

/** The models a host serves, and, where the core itself asks, how. */
export interface HostModels {
	/** Obsidian on the Mac: ["claude"]; the iPhone app later: what Swift serves. */
	readonly ids: readonly string[];
	/** Absent where the host asks the model itself (the door: prepare/finish). */
	readonly transport?: (id: string) => TransportLoader | undefined;
}

/** A host that serves no model: the door today, the phone plugin. */
export const NO_MODELS: HostModels = { ids: [] };

/** A stop signal and what stops it: the service's, one per run. */
export class StopSwitch implements StopSignal {
	private reason: StopReason | null = null;
	private readonly listeners = new Set<(reason: StopReason) => void>();

	get stopped(): StopReason | null {
		return this.reason;
	}

	onStop(fn: (reason: StopReason) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	/** The first stop counts; a later one changes nothing. */
	stop(reason: StopReason): void {
		if (this.reason !== null) return;
		this.reason = reason;
		for (const fn of [...this.listeners]) fn(reason);
	}
}
