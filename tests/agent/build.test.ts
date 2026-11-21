import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeVault, snapshotOf } from "./vault";

const PROGRAM = "agent/obsidian-task-calendar.mjs";
const committed = readFileSync(PROGRAM, "utf8");

/** A test that starts Node itself (the build, the program): a process each, slow to start on a busy machine. */
const PROCESS_MS = 30_000;

describe(PROGRAM, () => {
	it("is the build of agent/: run `node agent/build.mjs` after changing it or the core", { timeout: PROCESS_MS }, () => {
		expect(execFileSync("node", ["agent/build.mjs", "--stdout"], { encoding: "utf8" })).toBe(committed);
	});

	it("runs as a program: a Node shebang, executable", () => {
		expect(committed.startsWith("#!/usr/bin/env node\n")).toBe(true);
		expect(statSync(PROGRAM).mode & 0o111).toBe(0o111);
	});

	it("carries no model SDK and asks no network", () => {
		expect(committed).not.toMatch(/claude-agent-sdk|ClaudeTransport|googleapis\.com|\bfetch\(/);
	});

	it("answers on stdout with exit code 0, a failure with its code and exit code 1, and ends by itself", { timeout: PROCESS_MS }, () => {
		const vault = makeVault();
		const before = snapshotOf(vault);
		const ok = spawnSync("node", [PROGRAM, "inbox", "--vault", vault], { encoding: "utf8", timeout: 20_000 });
		expect(ok.status).toBe(0);
		expect(JSON.parse(ok.stdout)).toMatchObject({ list: "inbox", sections: [{ name: null, tasks: [{ title: "Idea for the report", place: "inbox" }] }] });
		const today = spawnSync("node", [PROGRAM, "today", "--vault", vault], { encoding: "utf8", timeout: 20_000 });
		expect(today.status).toBe(0);
		expect(JSON.parse(today.stdout)).toHaveProperty("timeline");
		const bad = spawnSync("node", [PROGRAM, "project", "Nothing", "--vault", vault], { encoding: "utf8", timeout: 20_000 });
		expect(bad.status).toBe(1);
		expect(JSON.parse(bad.stdout)).toMatchObject({ error: { code: "unknownProject" } });
		expect(snapshotOf(vault)).toEqual(before);
	});
});
