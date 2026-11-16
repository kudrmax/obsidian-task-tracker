import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { StopSwitch } from "../../../core/application/assistant/model";
import type { ModelQuestion } from "../../../core/application/contracts";
import { claudeEnv, ClaudeTransport, type ClaudeHost, findClaude } from "../../../obsidian/infrastructure/assistant/ClaudeTransport";

const HOME = "/Users/max";
const QUESTION: ModelQuestion = { instructions: "Pick one.", input: '{"tasks":[]}', answerSchema: { type: "object", properties: { taskRef: { type: "string" } } } };
const SETTINGS = { model: "sonnet", path: "" };

const as = (message: object) => message as SDKMessage;
const init = (apiKeySource = "none") => as({ type: "system", subtype: "init", apiKeySource });
const success = as({ type: "result", subtype: "success", is_error: false, result: "", structured_output: { taskRef: "t1" } });

/** The Mac as a test sets it up: the files that exist, the stream a call gets, the options it was given. */
class FakeMac implements ClaudeHost {
	readonly calls: { prompt: string; options: Options }[] = [];
	readonly home = HOME;
	env: Record<string, string | undefined> = { PATH: "/usr/bin:/bin", HOME, ANTHROPIC_API_KEY: "sk-key", ANTHROPIC_AUTH_TOKEN: "token", CLAUDE_CONFIG_DIR: "/x" };
	/** Read as the call reads them: after each message the next one waits for the test. */
	stream: (options: Options) => AsyncIterable<SDKMessage> = async function* () {
		yield init();
		yield success;
	};

	constructor(private readonly files: readonly string[] = ["/opt/homebrew/bin/claude"]) {}

	query = (params: { prompt: string; options: Options }) => {
		this.calls.push(params);
		return this.stream(params.options);
	};

	exists(path: string): boolean {
		return this.files.includes(path);
	}

}

describe("ClaudeTransport", () => {
	it("asks with exactly the spike's options: no tools, none of Max's settings, nothing kept, the schema, the path found, the plugin's folder", async () => {
		const mac = new FakeMac();
		const reply = await new ClaudeTransport("/vault/.obsidian/plugins/task-calendar", mac).ask(QUESTION, SETTINGS, new StopSwitch());
		expect(reply).toEqual({ ok: true, answer: { taskRef: "t1" } });
		const [{ prompt, options }] = mac.calls;
		expect(prompt).toBe(QUESTION.input);
		expect(options).toMatchObject({
			model: "sonnet",
			systemPrompt: "Pick one.",
			outputFormat: { type: "json_schema", schema: QUESTION.answerSchema },
			tools: [],
			settingSources: [],
			persistSession: false,
			cwd: "/vault/.obsidian/plugins/task-calendar",
			pathToClaudeCodeExecutable: "/opt/homebrew/bin/claude",
		});
		expect(options.maxTurns).toBeUndefined();
		expect(options.abortController).toBeInstanceOf(AbortController);
	});

	it("passes Obsidian's environment whole but the API keys, with node's folders on PATH", async () => {
		const mac = new FakeMac();
		await new ClaudeTransport("/p", mac).ask(QUESTION, SETTINGS, new StopSwitch());
		const env = mac.calls[0].options.env!;
		expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
		expect(env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
		expect(env).toMatchObject({ HOME, CLAUDE_CONFIG_DIR: "/x", PATH: "/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin" });
		expect(claudeEnv({}).PATH).toBe("/opt/homebrew/bin:/usr/local/bin");
		expect(claudeEnv({ PATH: "/usr/local/bin:/bin" }).PATH).toBe("/usr/local/bin:/bin:/opt/homebrew/bin");
	});

	it("finds claude: the path set, else Homebrew, then /usr/local, then ~/.local; none is notInstalled with no call", async () => {
		const exists = (...files: string[]) => (path: string) => files.includes(path);
		expect(findClaude("", exists("/usr/local/bin/claude", `${HOME}/.local/bin/claude`), HOME)).toBe("/usr/local/bin/claude");
		expect(findClaude("", exists(`${HOME}/.local/bin/claude`), HOME)).toBe(`${HOME}/.local/bin/claude`);
		expect(findClaude(" /my/claude ", exists("/my/claude", "/opt/homebrew/bin/claude"), HOME)).toBe("/my/claude");
		expect(findClaude("/my/claude", exists("/opt/homebrew/bin/claude"), HOME)).toBeNull();
		const mac = new FakeMac([]);
		const reply = await new ClaudeTransport("/p", mac).ask(QUESTION, SETTINGS, new StopSwitch());
		expect(reply).toMatchObject({ ok: false, failure: { kind: "notInstalled" } });
		expect(mac.calls).toEqual([]);
	});

	it("hints the path field with the claude found, or says none was", async () => {
		const transport = new ClaudeTransport("/p", new FakeMac(["/usr/local/bin/claude"]));
		expect(await transport.hint("path", SETTINGS)).toBe("/usr/local/bin/claude");
		expect(await transport.hint("path", { ...SETTINGS, path: "/nowhere/claude" })).toBe("Not found");
		expect(await transport.hint("model", SETTINGS)).toBeNull();
	});

	it("an API key in use stops the call at its init, before any answer", async () => {
		const mac = new FakeMac();
		let aborted = false;
		mac.stream = async function* (options) {
			yield init("ANTHROPIC_API_KEY");
			aborted = options.abortController!.signal.aborted;
			yield success;
		};
		const reply = await new ClaudeTransport("/p", mac).ask(QUESTION, SETTINGS, new StopSwitch());
		expect(reply).toMatchObject({ ok: false, failure: { kind: "noAccess" } });
		expect(mac.calls[0].options.abortController!.signal.aborted).toBe(true);
		expect(aborted).toBe(false);
	});

	it("a stop aborts the call: Max's replies stopped; the timeout's says why by the last retry", async () => {
		for (const [reason, expected] of [["user", "stopped"], ["timeout", "busy"]] as const) {
			const mac = new FakeMac();
			const stop = new StopSwitch();
			mac.stream = async function* (options) {
				yield init();
				yield as({ type: "system", subtype: "api_retry", error_status: 529, error: "overloaded" });
				stop.stop(reason);
				if (options.abortController!.signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
				yield success;
			};
			const reply = await new ClaudeTransport("/p", mac).ask(QUESTION, SETTINGS, stop);
			expect(reply).toMatchObject({ ok: false, failure: { kind: expected } });
		}
	});

	it("asked when already stopped, calls nothing", async () => {
		const mac = new FakeMac();
		const stop = new StopSwitch();
		stop.stop("user");
		expect(await new ClaudeTransport("/p", mac).ask(QUESTION, SETTINGS, stop)).toMatchObject({ ok: false, failure: { kind: "stopped" } });
		expect(mac.calls).toEqual([]);
	});
});

describe("eventsInWindow.js", () => {
	const events = createRequire(import.meta.url)("../../../obsidian/infrastructure/assistant/eventsInWindow.js") as typeof import("node:events");

	it("is Node's events, but setMaxListeners skips a target Node rejects (Chromium's AbortSignal in Obsidian's window)", () => {
		expect(events.EventEmitter).toBe(require("node:events").EventEmitter);
		const foreign = { addEventListener() {}, removeEventListener() {} };
		expect(() => events.setMaxListeners(50, foreign as unknown as EventTarget)).not.toThrow();
		const emitter = new events.EventEmitter();
		events.setMaxListeners(42, emitter);
		expect(emitter.getMaxListeners()).toBe(42);
	});
});
