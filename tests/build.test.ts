import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const SDK = "@anthropic-ai/claude-agent-sdk";
const TRANSPORT = "infrastructure/assistant/ClaudeTransport";

/** The plugin built as the release builds it, into a folder of the test's own. */
function build(): string {
	const out = join(mkdtempSync(join(tmpdir(), "task-calendar-build-")), "main.js");
	execFileSync("node", ["esbuild.config.mjs", "production", `--outfile=${out}`], { cwd: ROOT, stdio: "pipe" });
	return readFileSync(out, "utf8");
}

/** Anything asked of a stub is another stub: Obsidian's classes extended, its functions called, its values read. */
function stub(): unknown {
	const target = function () {} as unknown as object;
	return new Proxy(target, {
		get: (_, key) => (key === Symbol.toPrimitive ? () => "" : key === "prototype" ? {} : stub()),
		apply: () => stub(),
		construct: () => stub() as object,
	});
}

const NODE = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const OBSIDIAN = ["obsidian", "electron", "@codemirror/state", "@codemirror/view"];

describe("main.js", () => {
	const bundle = build();

	it("loads on the phone: no Node module is reached for at load, the agent SDK waits behind its loader", () => {
		const asked: string[] = [];
		const require = (id: string) => {
			if (OBSIDIAN.includes(id)) return stub();
			asked.push(id);
			if (NODE.has(id)) throw new Error(`${id} is not on the phone`);
			throw new Error(`unknown module ${id}`);
		};
		const module = { exports: {} as Record<string, unknown> };
		/** What every WebView has at load, the phone's too: the view's libraries (React's scheduler) reach for them as they load. */
		const browser = { queueMicrotask, setTimeout, clearTimeout, MessageChannel };
		runInNewContext(bundle, { require, module, exports: module.exports, window: stub(), document: stub(), globalThis: {}, ...browser });
		expect(asked).toEqual([]);
		expect(module.exports.default).toBeTypeOf("function");
	});

	it("carries the SDK, with events wrapped for Obsidian's window: setMaxListeners skips a signal Node rejects", () => {
		expect(bundle).toContain("pathToClaudeCodeExecutable");
		expect(bundle.match(/require\("(node:)?events"\)/g)).toEqual(['require("node:events")']);
	});
});

/** Every source of the Obsidian frontend, but the transport itself. */
function sources(dir: string): string[] {
	return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
		const path = `${dir}/${entry.name}`;
		return entry.isDirectory() ? sources(path) : /\.[cm]?[jt]s$/.test(entry.name) ? [path] : [];
	});
}

describe("the agent SDK stays behind its loader", () => {
	const files = [...sources("obsidian"), ...sources("core")].filter((file) => !file.endsWith(`${TRANSPORT}.ts`));

	it("only ClaudeTransport imports the SDK; elsewhere a type at most", () => {
		const offenders = files.filter((file) => {
			const text = readFileSync(join(ROOT, file), "utf8");
			return [...text.matchAll(new RegExp(`^\\s*(import|export)\\b(?!\\s+type\\b)[^;]*["']${SDK}["']`, "gm"))].length > 0 || text.includes(`require("${SDK}")`);
		});
		expect(offenders).toEqual([]);
	});

	it("ClaudeTransport is imported only by compose.ts's lazy loader, or as a type", () => {
		const offenders = files.flatMap((file) => {
			const text = readFileSync(join(ROOT, file), "utf8");
			const lines = text.split("\n").filter((line) => line.includes("/ClaudeTransport"));
			return lines.filter((line) => !/^\s*import\s+type\b/.test(line) && !(file === "obsidian/compose.ts" && /import\("\.\/infrastructure\/assistant\/ClaudeTransport"\)/.test(line))).map((line) => `${file}: ${line.trim()}`);
		});
		expect(offenders).toEqual([]);
	});
});
