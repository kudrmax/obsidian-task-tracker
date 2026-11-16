import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { ModelQuestion, ModelReply, ModelTransport, StopSignal } from "../../../core/application/contracts";
import { billsSubscription, claudeReply, type StreamEnd } from "./claudeStream";

/** Where Claude Code is looked for when the settings name no path: Homebrew on Apple silicon, then on Intel, then its own installer. */
export function claudePlaces(home: string): readonly string[] {
	return ["/opt/homebrew/bin/claude", "/usr/local/bin/claude", `${home}/.local/bin/claude`];
}

/** The `claude` a call runs: the path set, else the first place that has one; null when there is none. */
export function findClaude(setPath: string, exists: (path: string) => boolean, home: string): string | null {
	const places = setPath.trim() !== "" ? [setPath.trim()] : claudePlaces(home);
	return places.find(exists) ?? null;
}

/** Where `node` lives for an npm-installed `claude`, which the Dock's empty PATH lacks. */
const NODE_PLACES = ["/opt/homebrew/bin", "/usr/local/bin"];

/** Obsidian's environment, so Claude Code finds its login, without an API key (it would bill the key instead of the subscription), with `node` reachable. */
export function claudeEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string | undefined> {
	const { ANTHROPIC_API_KEY: _key, ANTHROPIC_AUTH_TOKEN: _token, ...rest } = env;
	const path = (env.PATH ?? "").split(":").filter((part) => part !== "");
	return { ...rest, PATH: [...path, ...NODE_PLACES.filter((place) => !path.includes(place))].join(":") };
}

/** What the transport needs of the Mac: the SDK's `query`, the file system, the environment. Tests give their own. */
export interface ClaudeHost {
	readonly query: (params: { prompt: string; options: Options }) => AsyncIterable<SDKMessage>;
	exists(path: string): boolean;
	readonly home: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	/** Each call's failure detail, besides the outcome's own: the console. */
	log(detail: string): void;
}

const macHost = (): ClaudeHost => ({
	query: (params) => query(params),
	exists: existsSync,
	home: homedir(),
	env: process.env,
	log: (detail) => console.warn(`Task Calendar assistant: ${detail}`),
});

/** Claude through Max's subscription: the agent SDK runs the system's Claude Code, straight from the plugin (spec, «Claude»). */
export class ClaudeTransport implements ModelTransport {
	constructor(
		/** The plugin's folder, absolute: the call's working directory. */
		private readonly cwd: string,
		private readonly host: ClaudeHost = macHost(),
	) {}

	async ask(question: ModelQuestion, modelSettings: Readonly<Record<string, string>>, stop: StopSignal): Promise<ModelReply> {
		const reply = await this.call(question, modelSettings, stop);
		if (!reply.ok && reply.failure.kind !== "stopped") this.host.log(reply.failure.detail);
		return reply;
	}

	async hint(fieldKey: string, modelSettings: Readonly<Record<string, string>>): Promise<string | null> {
		if (fieldKey !== "path") return null;
		return findClaude(modelSettings.path ?? "", (path) => this.host.exists(path), this.host.home) ?? "Not found";
	}

	private async call(question: ModelQuestion, modelSettings: Readonly<Record<string, string>>, stop: StopSignal): Promise<ModelReply> {
		if (stop.stopped) return claudeReply([], { kind: "done" }, stop.stopped);
		const path = findClaude(modelSettings.path ?? "", (p) => this.host.exists(p), this.host.home);
		if (path === null) return { ok: false, failure: { kind: "notInstalled", detail: `Claude: no claude at ${modelSettings.path?.trim() || claudePlaces(this.host.home).join(", ")}` } };
		const abort = new AbortController();
		const unsubscribe = stop.onStop(() => abort.abort());
		const messages: SDKMessage[] = [];
		let end: StreamEnd = { kind: "done" };
		try {
			for await (const message of this.host.query({ prompt: question.input, options: this.options(question, modelSettings, path, abort) })) {
				messages.push(message);
				if (message.type === "system" && message.subtype === "init" && !billsSubscription(message.apiKeySource)) {
					abort.abort();
					break;
				}
				if (message.type === "result") break;
			}
		} catch (error) {
			end = { kind: "threw", error };
		} finally {
			unsubscribe();
		}
		return claudeReply(messages, end, stop.stopped);
	}

	/** Exactly what the spike ran: no tools, none of Max's settings, nothing kept, the answer in the schema's shape. */
	options(question: ModelQuestion, modelSettings: Readonly<Record<string, string>>, path: string, abort: AbortController): Options {
		return {
			model: modelSettings.model,
			systemPrompt: question.instructions,
			outputFormat: { type: "json_schema", schema: question.answerSchema as Record<string, unknown> },
			tools: [],
			settingSources: [],
			persistSession: false,
			cwd: this.cwd,
			pathToClaudeCodeExecutable: path,
			env: claudeEnv(this.host.env),
			abortController: abort,
		};
	}
}
